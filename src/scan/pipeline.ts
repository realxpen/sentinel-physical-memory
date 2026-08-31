import type { PerceptionResult } from '../domain/sentinel'
import { validatePerceptionForScan } from '../ai/perception-schema'
import type { ModelAdapter } from '../ai/model'
import { EnvironmentalMemoryStore } from '../memory/store'
import type { ScanArtifact, ScanError, ScanFrame, ScanInput, ScanProgress, ScanResult } from './types'

export interface ScanPipelineDependencies { now?:()=>Date; id?:(prefix:string)=>string; onProgress?:(p:ScanProgress)=>void; model?:ModelAdapter; memory?:EnvironmentalMemoryStore }
const defaultId=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`

export class ScanPipeline {
 private readonly now:()=>Date; private readonly id:(prefix:string)=>string; private readonly onProgress?:(p:ScanProgress)=>void; private readonly model?:ModelAdapter; private readonly memory:EnvironmentalMemoryStore
 constructor(d:ScanPipelineDependencies={}) { this.now=d.now??(()=>new Date()); this.id=d.id??defaultId; this.onProgress=d.onProgress; this.model=d.model; this.memory=d.memory??new EnvironmentalMemoryStore({now:this.now}) }
 async run(input:ScanInput):Promise<ScanResult> {
  const scanId=this.id('scan'); this.emit(scanId,'queued',0,'Scan queued'); this.validate(input); this.emit(scanId,'validating',15,'Input validated'); this.ensureEnvironment(input)
  const frames=this.sample(input); this.emit(scanId,'sampling',35,`${frames.length} key frame(s) selected`)
  const artifacts=this.createArtifacts(frames,input); this.emit(scanId,'extracting',55,`${artifacts.filter(a=>a.kind==='frame').length} frame artifact(s) prepared`)
  const perception=await this.perceive(scanId,artifacts,input); const observations=perception.observations.map(x=>({...x})); this.emit(scanId,'normalizing',75,`${observations.length} observation(s) normalized`)
  const state=this.memory.ingestScan(input.environmentId,input.source,perception); this.emit(scanId,'memorizing',88,`Environmental state v${state.version} created`)
  const previous=this.memory.get(input.environmentId)?.states.find(s=>s.version===state.version-1); let diff
  if(previous){ this.emit(scanId,'comparing',94,`Comparing state v${previous.version} with v${state.version}`); diff=this.memory.compare(input.environmentId,previous.id,state.id) }
  this.emit(scanId,'complete',100,diff?`Scan complete: ${diff.changes.length} change(s) detected`:'Scan pipeline complete')
  return {scanId,environmentId:input.environmentId,source:input.source,frames,artifacts,observations,state,diff,completedAt:this.now().toISOString()}
 }
 getMemory(environmentId:string){return this.memory.get(environmentId)}
 private ensureEnvironment(input:ScanInput){if(this.memory.get(input.environmentId))return;this.memory.createEnvironment({id:input.environmentId,name:input.source.metadata?.name?.toString()??'SENTINEL Environment',type:'other',description:'Environment created automatically by the scan pipeline.',createdAt:input.source.capturedAt,updatedAt:input.source.capturedAt,stateIds:[],roomIds:[],objectIds:[],issueIds:[]})}
 private async perceive(scanId:string,artifacts:ScanArtifact[],input:ScanInput):Promise<PerceptionResult>{if(!this.model)return{sourceId:input.source.id,observations:[],objects:[],relations:[],evidence:[]};const result=await this.model.infer({role:'perception',artifacts,prompt:[`Analyze scan ${scanId} for environment ${input.environmentId}.`,`The scan source id is ${input.source.id}.`,'Identify only visually supported rooms, objects, conditions, and spatial relationships.','Create evidence entries for every observation and object grounded to supplied frames.','Return the SENTINEL PerceptionResult JSON schema exactly.'].join('\n')});return validatePerceptionForScan(result,input.environmentId,input.source.id)}
 private validate(input:ScanInput){if(!input.environmentId)throw this.error('INVALID_ENVIRONMENT','environmentId is required');if(!input.source?.id)throw this.error('INVALID_SOURCE','source.id is required');if(!input.media.uri)throw this.error('INVALID_MEDIA','media.uri is required');if(!input.media.mimeType)throw this.error('INVALID_MEDIA','media.mimeType is required');if(input.media.kind==='image'&&input.media.durationMs!==undefined)throw this.error('INVALID_MEDIA','image media cannot declare durationMs');if(input.media.kind==='video'&&(!input.media.extractedFrames?.length))throw this.error('VIDEO_FRAMES_REQUIRED','Video media must provide extracted frames before perception')}
 private sample(input:ScanInput):ScanFrame[]{if(input.media.kind==='video'&&input.media.extractedFrames?.length){const max=Math.max(1,input.options?.maxFrames??input.media.extractedFrames.length);return input.media.extractedFrames.slice(0,max)}return[{frameId:this.id('frame'),timestampMs:0,uri:input.media.uri}]}
 private createArtifacts(frames:ScanFrame[],input:ScanInput):ScanArtifact[]{const artifacts:ScanArtifact[]=frames.map(f=>({artifactId:this.id('artifact'),frameId:f.frameId,kind:'frame',uri:f.uri}));if(input.options?.preserveAudio&&input.media.kind==='video'){artifacts.push({artifactId:this.id('artifact'),kind:'audio',uri:input.media.uri})}artifacts.push({artifactId:this.id('artifact'),kind:'metadata',uri:input.media.uri});return artifacts}
 private emit(scanId:string,stage:ScanProgress['stage'],progress:number,message:string){this.onProgress?.({scanId,stage,progress,message})}
 private error(code:string,message:string):ScanError{return Object.assign(new Error(message),{code,recoverable:false})}
}
