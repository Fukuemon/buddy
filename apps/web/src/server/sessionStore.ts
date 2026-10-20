import Valkey from 'iovalkey'

/** セッションと、ログインの途中の値を置く場所。値は JSON にして置く。 */
export interface SessionStore {
  get<T>(key: string): Promise<T | undefined>
  /** ttlSeconds が無ければ、今の期限を保つ。 */
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>
  /** 値を返して消す。無ければ undefined を返す。 */
  take<T>(key: string): Promise<T | undefined>
  delete(key: string): Promise<void>
  /** 置き場に届くかを確かめる。届かなければ Error を投げる。 */
  ping(): Promise<void>
}

const parse = <T>(raw: string | null): T | undefined =>
  raw === null ? undefined : (JSON.parse(raw) as T)

/** url（`redis://host:port`）の Valkey に置く SessionStore を作る。 */
export const createValkeySessionStore = (url: string): SessionStore => {
  // 落ちている間の命令は、再接続を 1 回試したら失敗させる。既定の 20 回では要求を長く待たせる
  const client = new Valkey(url, { maxRetriesPerRequest: 1, connectTimeout: 2000 })
  // error を聞かないと、iovalkey は接続の失敗を処理されない例外として出す
  client.on('error', () => {})
  return {
    get: async (key) => parse(await client.get(key)),
    set: async (key, value, ttlSeconds) => {
      const raw = JSON.stringify(value)
      if (ttlSeconds === undefined) await client.set(key, raw, 'KEEPTTL')
      else await client.set(key, raw, 'EX', ttlSeconds)
    },
    take: async (key) => parse(await client.getdel(key)),
    delete: async (key) => {
      await client.del(key)
    },
    ping: async () => {
      await client.ping()
    },
  }
}

/** テストで使う、メモリに置く SessionStore。期限は見ない。 */
export const createMemorySessionStore = (): SessionStore & { values: Map<string, string> } => {
  const values = new Map<string, string>()
  return {
    values,
    get: async (key) => parse(values.get(key) ?? null),
    set: async (key, value) => {
      values.set(key, JSON.stringify(value))
    },
    take: async (key) => {
      const raw = values.get(key) ?? null
      values.delete(key)
      return parse(raw)
    },
    delete: async (key) => {
      values.delete(key)
    },
    ping: async () => {},
  }
}
