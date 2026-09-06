# SENTINEL Infrastructure

The active Phase 3 durable-memory provider is **Neon / Lakebase Postgres**.

Apply:

- `neon/phase-3-environmental-memory.sql`

The older `supabase/phase-3-environmental-memory.sql` file is a superseded Phase 3 implementation artifact retained for project history. Do not apply it to the active SENTINEL environment.

Runtime database credentials stay server-side in `DATABASE_URL`; browser/Vite variables must never contain database credentials.
