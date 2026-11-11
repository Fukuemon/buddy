// web のセッションの refresh を、ログインの仕組みの故障の中で起こすための操作。compose のコンテナを docker で直に操作する。
// 故障を入れる仕組みは本番のコードに足さず、テストのディレクトリに置く（ADR-0044 の監視と復旧）。
import { execFileSync, spawnSync } from 'node:child_process'

import type { BrowserContext } from '@playwright/test'

/** 操作する compose のプロジェクトの名前。main の checkout の compose（buddy）を止めないよう、worktree の .env の値だけを使う。 */
const composeProject = () => {
  const project = process.env.COMPOSE_PROJECT_NAME
  if (project === undefined || project === 'buddy')
    throw new Error('worktree の .env の COMPOSE_PROJECT_NAME で、撮る compose を指す')
  return project
}

const container = (service: string) => `${composeProject()}-${service}-1`
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' })

/** context の cookie から、web のセッションの ID を取り出す。cookie の値は `ID.署名` である。 */
const sessionIdOf = async (context: BrowserContext) => {
  const cookie = (await context.cookies()).find((c) => c.name === 'buddy_session')
  if (cookie === undefined) throw new Error('cookie buddy_session が無い')
  const value = decodeURIComponent(cookie.value)
  return value.slice(0, value.lastIndexOf('.'))
}

/**
 * Valkey のセッションの access token の期限を、過ぎた時刻に書き換える。次の表示で、BFF が refresh を試す。
 * 5 分を待たずに refresh を起こすためで、#877 の測定と同じ方法である。
 */
export const expireAccessToken = async (context: BrowserContext) => {
  const key = `session:${await sessionIdOf(context)}`
  const raw = docker('exec', container('valkey'), 'valkey-cli', '--raw', 'GET', key).trim()
  if (raw === '') throw new Error(`セッション ${key} が Valkey に無い`)
  const session = JSON.parse(raw) as Record<string, unknown>
  const expired = JSON.stringify({ ...session, expiresAt: Date.now() - 1000 })
  docker('exec', container('valkey'), 'valkey-cli', 'SET', key, expired, 'KEEPTTL', 'XX')
}

/** セッションが Valkey に残っているかを返す。 */
export const sessionExists = async (context: BrowserContext) =>
  docker('exec', container('valkey'), 'valkey-cli', 'EXISTS', `session:${await sessionIdOf(context)}`).trim() === '1'

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
  return `${logs.stdout}${logs.stderr}`
    .split('\n')
    .filter((line) => /retrying in|giving up after/.test(line)).length
}
