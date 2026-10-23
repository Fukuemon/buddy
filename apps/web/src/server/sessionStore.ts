import { randomBytes } from 'node:crypto'

import Valkey from 'iovalkey'

/** セッションと、ログインの途中の値を置く場所。値は JSON にして置く。 */
export interface SessionStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>
  /** 今ある値だけを、期限を保って置き換える。無ければ置かずに false を返す。 */
  replace(key: string, value: unknown): Promise<boolean>
  /** key の鍵を ttlMs の間だけ取り、放すときに渡す値を返す。ほかが取っていれば undefined を返す。 */
  lock(key: string, ttlMs: number): Promise<string | undefined>
  /** lock が返した値の鍵だけを放す。期限が切れてほかが取り直した鍵は放さない。 */
  unlock(key: string, token: string): Promise<void>
  /** key の鍵か値があれば true を返す。 */
  exists(key: string): Promise<boolean>
  /** 値を返して消す。無ければ undefined を返す。 */
  take<T>(key: string): Promise<T | undefined>
  delete(key: string): Promise<void>
  /** 保存先に届くかを確認する。届かなければ Error を投げる。 */
  ping(): Promise<void>
}

const parse = <T>(raw: string | null): T | undefined =>
  raw === null ? undefined : (JSON.parse(raw) as T)

/** 値が token のときだけ鍵を消す。get と del の間にほかが取り直した鍵を消さないよう、1 つの命令にする。 */
const UNLOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0"

/** url（`redis://host:port`）の Valkey に置く SessionStore を作る。 */
export const createValkeySessionStore = (url: string): SessionStore => {
  // 落ちている間の命令は、再接続を 1 回試したら失敗させる。デフォルトの 20 回ではリクエストを長く待たせる
  const client = new Valkey(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
  })
  // error を聞かないと、iovalkey は接続の失敗を処理されない例外として出す
  client.on('error', () => {})
  return {
    get: async (key) => parse(await client.get(key)),
    set: async (key, value, ttlSeconds) => {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    },
    replace: async (key, value) =>
      (await client.set(key, JSON.stringify(value), 'KEEPTTL', 'XX')) === 'OK',
    lock: async (key, ttlMs) => {
      const token = randomBytes(16).toString('base64url')
      return (await client.set(key, token, 'PX', ttlMs, 'NX')) === 'OK' ? token : undefined
    },
    unlock: async (key, token) => {
      await client.eval(UNLOCK_SCRIPT, 1, key, token)
    },
    exists: async (key) => (await client.exists(key)) === 1,
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
    replace: async (key, value) => {
      if (!values.has(key)) return false
      values.set(key, JSON.stringify(value))
      return true
    },
    lock: async (key) => {
      if (values.has(key)) return undefined
      const token = randomBytes(16).toString('base64url')
      values.set(key, JSON.stringify(token))
      return token
    },
    unlock: async (key, token) => {
      if (values.get(key) === JSON.stringify(token)) values.delete(key)
    },
    exists: async (key) => values.has(key),
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
