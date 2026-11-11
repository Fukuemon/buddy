// ログインの仕組みに故障を入れるための、compose のコンテナの操作。docker で直に操作する。
// 故障を入れる仕組みは本番のコードに足さず、テストのディレクトリに置く（ADR-0044 の監視と復旧）。
// エビデンスの spec（tests/evidence/login/session-refresh.e2e.ts）も、tests/fixtures/sessionFaults.ts を通して使う。
import { execFile, execFileSync, spawnSync } from 'node:child_process'

import type { BrowserContext } from '@playwright/test'

import { COMPOSE_PROJECT } from '../../tests/fixtures/env'

/**
 * 操作する compose のプロジェクトの名前。main の checkout の compose（buddy）は止めない。
 * docker がコンテナの名前をオプションと読まないよう、compose のプロジェクトの名前の形かも確認する。
 */
export const composeProject = () => {
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

/** compose のサービス service の、1 つ目のコンテナの名前。 */
export const container = (service: string) => `${composeProject()}-${service}-1`

/**
 * docker を流し、標準出力を返す。失敗したら、docker の操作の名前だけを文にして投げる。
 * 標準エラーには valkey-cli の応答が出ることがあるので、例外の文に載せない。
 */
const docker = (...args: string[]) => dockerWithInput(undefined, ...args)

/** docker を、標準入力に input を渡して流す。psql の変数は -c の文に展開されないので、SQL を標準入力で渡すのに使う。 */
const dockerWithInput = (input: string | undefined, ...args: string[]) => {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
    })
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

/** サービスのコンテナを止める。 */
export const stopService = (service: string) => docker('stop', container(service))

/** サービスのコンテナを一時停止する。接続は張れるが、答えが返らない。 */
export const pauseService = (service: string) => docker('pause', container(service))

/** サービスのコンテナを再起動する。 */
export const restartService = (service: string) => docker('restart', container(service))

/** 止めたか一時停止したサービスのコンテナを戻す。動いていれば何もしない。 */
export const restoreService = (service: string) => {
  const state = docker('inspect', '-f', '{{.State.Status}}', container(service)).trim()
  if (state === 'paused') docker('unpause', container(service))
  else if (state !== 'running') docker('start', container(service))
}

/** サービスのコンテナのヘルスチェックの状態を返す。戻した後に healthy になるのを待つのに使う。 */
export const serviceHealth = (service: string) =>
  docker('inspect', '-f', '{{.State.Health.Status}}', container(service)).trim()

/** ブローカーを止める。Hydra の token_hook はブローカーに届かず、Hydra は約 3 秒で refresh を 500 にする。 */
export const stopBroker = () => stopService('broker')

/** ブローカーを一時停止する。token_hook の接続は張れるが答えが返らず、BFF は Hydra を待つ上限の 5 秒で打ち切る。 */
export const pauseBroker = () => pauseService('broker')

/** 止めたか一時停止したブローカーを戻す。ヘルスチェックが通るのは、呼んだ側が toPass で待つ。 */
export const restoreBroker = () => restoreService('broker')

/** ブローカーのヘルスチェックの状態を返す。 */
export const brokerHealth = () => serviceHealth('broker')

/** since から後のサービスのログを返す。docker logs は、コンテナの標準エラーを標準エラーに出すので、両方を読む。 */
export const serviceLogs = (service: string, since: Date) => {
  const logs = spawnSync('docker', ['logs', '--since', since.toISOString(), container(service)], {
    encoding: 'utf8',
  })
  if (logs.status !== 0) throw new Error(`${service} のログを読めなかった`)
  return `${logs.stdout}${logs.stderr}`
}

/**
 * since から後の Hydra のログで、token_hook を呼んで失敗した回数を数える。1 回のトークンの要求で、Hydra は hook を 3 回まで呼ぶ。
 * 呼び直しの行（retrying in）と、呼び直しを打ち切った行（giving up after）を足す。
 */
export const countFailedHookCalls = (since: Date) =>
  serviceLogs('hydra', since)
    .split('\n')
    .filter((line) => /retrying in|giving up after/.test(line)).length

/** PostgreSQL に、管理者（compose の buddy）で SQL を流し、結果を返す。 */
const psql = (sql: string) =>
  docker(
    'exec',
    container('postgres'),
    'psql',
    '-U',
    'buddy',
    '-d',
    'buddy',
    '-v',
    'ON_ERROR_STOP=1',
    '-Atc',
    sql,
  )

/** 故障のために流す SQL が触ってよいデータベース。 */
export type FaultDatabase = 'broker' | 'hydra'

/**
 * データベースへの新しい接続を禁じ、張られた接続を切る。ほかのデータベースは動いたままにする。
 * 接続は拒まれてすぐ失敗するので、答えない DB ではない。
 */
export const blockDatabase = (db: FaultDatabase) => {
  psql(`ALTER DATABASE ${db} ALLOW_CONNECTIONS false`)
  psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}'`)
}

/** blockDatabase で禁じた接続を許し直す。 */
export const unblockDatabase = (db: FaultDatabase) =>
  psql(`ALTER DATABASE ${db} ALLOW_CONNECTIONS true`)

/** 答えない DB を作るために、ブローカーの staff のテーブルを握る接続の application_name。 */
const LOCK_APP = 'buddy-faults-lock'

/**
 * ブローカーの staff のテーブルを、別の接続で排他のロックで握る。hook が職員を引く問い合わせは、ロックが外れるまで答えない。
 * 張った接続は seconds 秒の後に終わるが、releaseBrokerStaffLock で先に切る。
 */
export const lockBrokerStaff = (seconds: number) => {
  docker(
    'exec',
    '-d',
    '-e',
    `PGAPPNAME=${LOCK_APP}`,
    container('postgres'),
    'psql',
    '-U',
    'buddy',
    '-d',
    'broker',
    '-c',
    `BEGIN; LOCK TABLE staff IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(${Math.trunc(seconds)});`,
  )
}

/** ロックを握った接続がロックを取ったかを返す。 */
export const brokerStaffLocked = () =>
  psql(
    `SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE a.application_name = '${LOCK_APP}' AND l.mode = 'AccessExclusiveLock' AND l.granted`,
  ).trim() !== '0'

/** lockBrokerStaff の接続を切り、ロックを外す。 */
export const releaseBrokerStaffLock = () =>
  psql(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${LOCK_APP}'`,
  )

/** ブローカーの DB の職員の状態を、ブローカーの操作を通さずに書き換える。Hydra のトークンは取り消さない。 */
export const setBrokerStaffStatus = (email: string, status: 'active' | 'suspended') =>
  dockerWithInput(
    "UPDATE staff SET status = :'status' WHERE email = lower(:'email');",
    'exec',
    '-i',
    container('postgres'),
    'psql',
    '-U',
    'buddy',
    '-d',
    'broker',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    `email=${email}`,
    '-v',
    `status=${status}`,
    '-At',
  )

/**
 * web のコンテナから、compose の中の名前で Hydra の client credentials のトークンを取る。portless を通さない。
 * portless は、Hydra が答えずに切った接続を 502 にして返すので、Hydra が何を返したかは中から呼んで見る。
 * 返すのは、状態コード（答えが無いまま切れたら null）、切れたときの理由、かかった秒である。非同期で、ほかの呼び出しと並べられる。
 */
export const clientCredentialsInsideCompose = (): Promise<{
  status: number | null
  failure?: string
  seconds: number
}> => {
  const script = `const s = Date.now()
fetch('http://hydra:4444/oauth2/token', {
  method: 'POST',
  headers: { authorization: 'Basic ' + btoa('schedule:schedule-dev'), 'content-type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials&audience=broker',
  signal: AbortSignal.timeout(150000),
}).then(
  (r) => console.log(JSON.stringify({ status: r.status, seconds: (Date.now() - s) / 1000 })),
  (e) => console.log(JSON.stringify({ status: null, failure: String(e.cause?.code ?? e.name), seconds: (Date.now() - s) / 1000 })),
)`
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['exec', container('web'), 'node', '-e', script],
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error) reject(new Error('web のコンテナから Hydra を呼べなかった'))
        else
          resolve(
            JSON.parse(stdout.trim()) as {
              status: number | null
              failure?: string
              seconds: number
            },
          )
      },
    )
  })
}

/** スタブの操作の口を呼び、JSON の答えを返す。 */
const stub = (pathAndQuery: string) =>
  JSON.parse(
    docker('exec', container('hook-stub'), 'wget', '-qO-', `http://127.0.0.1:9000${pathAndQuery}`),
  ) as unknown

/** スタブの答え方。省いた値は素通し。 */
export type StubMode = { status?: number; delayMs?: number; hang?: boolean }

/** スタブの答え方を切り替え、受けた hook の一覧を空にする。引数を省くと素通しに戻す。 */
export const setStubMode = (mode: StubMode = {}) => {
  const query = new URLSearchParams()
  if (mode.status !== undefined) query.set('status', String(mode.status))
  if (mode.delayMs !== undefined) query.set('delay_ms', String(mode.delayMs))
  if (mode.hang) query.set('hang', '1')
  stub(`/mode?${query}`)
  stub('/reset')
}

/** スタブが受けた hook の 1 件。時刻はエポックからのミリ秒である。 */
export type StubCall = {
  receivedAt: number
  respondedAt: number | null
  closedAt: number | null
  status: number | null
}

/** スタブが受けた hook の一覧を返す。 */
export const stubCalls = () => stub('/calls') as StubCall[]
