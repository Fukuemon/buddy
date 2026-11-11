// web のセッションの refresh を、ログインの仕組みの故障の中で起こすための操作。compose のコンテナを docker で直に操作する。
// 故障を入れる仕組みは本番のコードに足さず、テストのディレクトリに置く（ADR-0044 の監視と復旧）。
import { execFileSync, spawnSync } from 'node:child_process'

import type { BrowserContext } from '@playwright/test'

import { COMPOSE_PROJECT } from './env'

/**
 * 操作する compose のプロジェクトの名前。main の checkout の compose（buddy）は止めない。
 * docker がコンテナの名前をオプションと読まないよう、compose のプロジェクトの名前の形かも確認する。
 */
const composeProject = () => {
  if (
    COMPOSE_PROJECT === undefined ||
    COMPOSE_PROJECT === 'buddy' ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(COMPOSE_PROJECT)
  )
    throw new Error(
      'worktree の .env の COMPOSE_PROJECT_NAME か E2E_COMPOSE_PROJECT で、撮る compose を指す',
    )
  return COMPOSE_PROJECT
}

const container = (service: string) => `${composeProject()}-${service}-1`

/**
 * docker を流し、標準出力を返す。失敗したら、docker の操作の名前だけを文にして投げる。
 * 標準エラーには valkey-cli の応答が出ることがあるので、例外の文に載せない。
 */
const docker = (...args: string[]) => {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error(`docker ${args[0]} が失敗した`)
  }
}

/** context の cookie から、web のセッションの ID を取り出す。cookie の値は `ID.署名` である。 */
const sessionIdOf = async (context: BrowserContext) => {
  const cookie = (await context.cookies()).find((c) => c.name === 'buddy_session')
  if (cookie === undefined) throw new Error('cookie buddy_session が無い')
  const value = decodeURIComponent(cookie.value)
  return value.slice(0, value.lastIndexOf('.'))
}

/**
 * Valkey の中で、セッションの JSON の expiresAt の数だけを置き換える。トークンを含む JSON を、docker の引数とテストに出さない。
 * JSON を解いて書き直すと、空の配列がオブジェクトになるので、文字列のまま置き換える。
 * 返すのは、キーが無ければ missing、expiresAt が無ければ no-expiry、置き換えたら OK である。
 */
const EXPIRE_SCRIPT = `local v = redis.call('GET', KEYS[1])
if not v then return 'missing' end
local replaced, n = string.gsub(v, '"expiresAt":%d+', '"expiresAt":' .. ARGV[1], 1)
if n == 0 then return 'no-expiry' end
redis.call('SET', KEYS[1], replaced, 'KEEPTTL', 'XX')
return 'OK'`

/**
 * Valkey のセッションの access token の期限を、過ぎた時刻に書き換える。次の表示で、BFF が refresh を試す。
 * 5 分を待たずに refresh を起こすためで、#877 の測定と同じ方法である。
 */
export const expireAccessToken = async (context: BrowserContext) => {
  const key = `session:${await sessionIdOf(context)}`
  const expiresAt = String(Date.now() - 1000)
  const result = docker(
    'exec',
    container('valkey'),
    'valkey-cli',
    '--raw',
    'EVAL',
    EXPIRE_SCRIPT,
    '1',
    key,
    expiresAt,
  ).trim()
  if (result !== 'OK') throw new Error(`セッションの期限を書き換えられなかった: ${result}`)
}

/** セッションが Valkey に残っているかを返す。 */
export const sessionExists = async (context: BrowserContext) =>
  docker(
    'exec',
    container('valkey'),
    'valkey-cli',
    'EXISTS',
    `session:${await sessionIdOf(context)}`,
  ).trim() === '1'

/** ブローカーを止める。Hydra の token_hook はブローカーに届かず、Hydra は約 3 秒で refresh を 500 にする。 */
export const stopBroker = () => docker('stop', container('broker'))

/** ブローカーを一時停止する。token_hook の接続は張れるが答えが返らず、BFF は Hydra を待つ上限の 5 秒で打ち切る。 */
export const pauseBroker = () => docker('pause', container('broker'))

/** 止めたか一時停止したブローカーを戻す。ヘルスチェックが通るのは、呼んだ側が toPass で待つ。 */
export const restoreBroker = () => {
  const state = docker('inspect', '-f', '{{.State.Status}}', container('broker')).trim()
  if (state === 'paused') docker('unpause', container('broker'))
  else if (state !== 'running') docker('start', container('broker'))
}

/** ブローカーのヘルスチェックの状態を返す。戻した後に healthy になるのを待つのに使う。 */
export const brokerHealth = () =>
  docker('inspect', '-f', '{{.State.Health.Status}}', container('broker')).trim()

/**
 * since から後の Hydra のログで、token_hook を呼んで失敗した回数を数える。1 回のトークンの要求で、Hydra は hook を 3 回まで呼ぶ。
 * 呼び直しの行（retrying in）と、呼び直しを打ち切った行（giving up after）を足す。
 */
export const countFailedHookCalls = (since: Date) => {
  // docker logs は、コンテナの標準エラーを標準エラーに出すので、両方を読む
  const logs = spawnSync('docker', ['logs', '--since', since.toISOString(), container('hydra')], {
    encoding: 'utf8',
  })
  if (logs.status !== 0) throw new Error('Hydra のログを読めなかった')
  return `${logs.stdout}${logs.stderr}`
    .split('\n')
    .filter((line) => /retrying in|giving up after/.test(line)).length
}
