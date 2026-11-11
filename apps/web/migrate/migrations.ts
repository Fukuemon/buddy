/** web のセッションのテーブルのマイグレーションの版と、当てる処理（ADR-0045）。 */
import pg from 'pg'

/** 当てる順に並べた版。当てた版は書き換えず、変えるときは新しい版を足す。 */
const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE web_sessions (
        key text PRIMARY KEY,
        value bytea NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX web_sessions_expires_at ON web_sessions (expires_at);
      CREATE TABLE web_session_locks (
        key text PRIMARY KEY,
        token text NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX web_session_locks_expires_at ON web_session_locks (expires_at);
    `,
  },
]

/** 複数のジョブが同時に流れても、版を二重に当てないための鍵の番号。 */
const MIGRATE_LOCK_ID = 1032

/** url の PostgreSQL に、まだ当てていない版を順に当てる。当てられなければ Error を投げる。 */
export const migrateUp = async (url: string) => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK_ID])
    await client.query(
      'CREATE TABLE IF NOT EXISTS web_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    )
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM web_schema_migrations',
    )
    const applied = new Set(rows.map((row) => row.version))
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query('INSERT INTO web_schema_migrations (version) VALUES ($1)', [
          migration.version,
        ])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      console.log(JSON.stringify({ msg: 'migration applied', version: migration.version }))
    }
  } finally {
    await client.end()
  }
}
