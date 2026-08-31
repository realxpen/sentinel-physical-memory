import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">SENTINEL / PHYSICAL ENVIRONMENT INTELLIGENCE</div>
        <h1>Give the physical world a memory.</h1>
        <p>Scan an environment, understand what matters, remember its state, and verify what changed.</p>
        <div className="actions">
          <button type="button">Scan environment</button>
          <button type="button" className="secondary">View memory</button>
        </div>
      </section>
      <section className="status-grid" aria-label="Environment status">
        <article><span>Last scan</span><strong>Office · Awaiting first scan</strong></article>
        <article><span>Objects</span><strong>—</strong></article>
        <article><span>Issues</span><strong>—</strong></article>
        <article><span>Memory</span><strong>Ready</strong></article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
