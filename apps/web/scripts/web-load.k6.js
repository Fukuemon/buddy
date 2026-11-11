/**
 * web の負荷の検証の k6 の筋書き（ADR-0047、#1040）。web の HTTP の入口から、ログイン、画面の操作、トークンの更新、ログアウトを流す。
 *
 * 使い方: k6 run --insecure-skip-tls-verify apps/web/scripts/web-load.k6.js
 * setup で負荷用の職員を LOAD_USERS 人登録し、職員ごとに 1 つの VU がログインして画面を使う。登録した職員は消さない。
 * トークンの更新は、筋書きで別に起こさない。web が、access token の期限の 60 秒前を過ぎたリクエストで更新する。
 *
 * 環境変数（全て任意）:
 * - LOAD_WEB_URL、LOAD_HYDRA_URL、LOAD_SCHEDULE_URL: web、Hydra、予定の API の URL。デフォルトは main の checkout の compose
 * - LOAD_USERS: 同時にログインしている職員の数。デフォルトは 100
 * - LOAD_LOGIN_WINDOW_S: 全員がログインし終えるまでの秒数。デフォルトは 300
 * - LOAD_DURATION_S: 最初のログインからログアウトまでの秒数。デフォルトは 420
 * - LOAD_READ_INTERVAL_S: 職員 1 人が BFF を呼ぶ平均の間隔。この値の半分から 1.5 倍の間で揺らす。デフォルトは 2
 * - LOAD_CLIENT_IP_HEADER: ブローカーが送信元とみなすヘッダーの名前（ブローカーの CLIENT_IP_HEADER）。あれば VU ごとに違うアドレスを書く
 * - LOAD_MANAGER_EMAIL: 職員を登録するマネージャーのメール。デフォルトは予定の API のシードの青木 陽菜
 */
import { check, fail, sleep } from 'k6'
import { sha256 } from 'k6/crypto'
import { b64encode } from 'k6/encoding'
import exec from 'k6/execution'
import http from 'k6/http'
import { Counter, Trend } from 'k6/metrics'

const env = (name, fallback) => __ENV[name] || fallback
const WEB = env('LOAD_WEB_URL', 'https://web.buddy.localhost')
const HYDRA = env('LOAD_HYDRA_URL', 'https://hydra.buddy.localhost')
const SCHEDULE = env('LOAD_SCHEDULE_URL', 'https://schedule.buddy.localhost')
const USERS = Number(env('LOAD_USERS', '100'))
const LOGIN_WINDOW_S = Number(env('LOAD_LOGIN_WINDOW_S', '300'))
const DURATION_S = Number(env('LOAD_DURATION_S', '420'))
const READ_INTERVAL_S = Number(env('LOAD_READ_INTERVAL_S', '2'))
const CLIENT_IP_HEADER = env('LOAD_CLIENT_IP_HEADER', '')
const MANAGER_EMAIL = env('LOAD_MANAGER_EMAIL', 'hina.aoki@example.com')

/** 予定の API のシードの 1 つ目の事業所と、職員を登録するときの部署、チーム、役職（メンバー）。E2E の STAFF_FORM と同じ値である。 */
const STAFF_FORM = {
  facilityId: '01M3TC5H00QV17BC0J9V3393ZP',
  departmentId: '01M3TC5HZ8A18D2TP3PTKDXJMN',
  teamId: '01M3TC5KXRSEVXQZ2MTJK9FS45',
  positionId: '01M3TC5QTRHSXHE7C68HPN6MBH',
}

/** TanStack Start は、server function の ID を、ファイルと関数の名前の SHA-256 にする。 */
const CALL_BFF_URL = `${WEB}/_serverFn/${sha256('src/api/bff/serverFns.ts--callBffFn_createServerFn_handler', 'hex')}`

const loginDuration = new Trend('login_duration', true)
const bffDuration = new Trend('bff_duration', true)
const bffFailed = new Counter('bff_failed')
const loginFailed = new Counter('login_failed')

export const options = {
  setupTimeout: '20m',
  scenarios: {
    staff: {
      executor: 'per-vu-iterations',
      vus: USERS,
      iterations: 1,
      maxDuration: `${DURATION_S + 120}s`,
    },
  },
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)', 'max'],
}

/** 予定の画面を開いたときに、画面が BFF へ送る呼び出し。schedules.list の期間は、流す日を含む 6 週にする。 */
const scheduleScreenCalls = () => {
  const from = new Date(Date.now() - 14 * 86400_000).toISOString()
  const to = new Date(Date.now() + 28 * 86400_000).toISOString()
  return [
    { op: 'facilities.get', args: [STAFF_FORM.facilityId] },
    { op: 'teams.list', args: [STAFF_FORM.facilityId] },
    { op: 'staff.list', args: [STAFF_FORM.facilityId, {}] },
    { op: 'patients.list', args: [STAFF_FORM.facilityId, {}] },
    {
      op: 'schedules.list',
      args: [STAFF_FORM.facilityId, { from, to, staffIds: [], includeCancelled: false }],
    },
  ]
}

/**
 * server function の引数を、TanStack Start の画面が送る seroval の JSON の形にする。
 * 筋書きが送る値（文字列、真偽値、配列、オブジェクト）だけを扱う。
 */
const serovalBody = (data) => {
  let next = 0
  const encode = (value) => {
    if (typeof value === 'string') return { t: 1, s: value }
    if (typeof value === 'boolean') return { t: 2, s: value ? 2 : 3 }
    if (Array.isArray(value)) return { t: 9, i: next++, a: value.map(encode), o: 0 }
    const id = next++
    const keys = Object.keys(value)
    return { t: 10, i: id, p: { k: keys, v: keys.map((k) => encode(value[k])) }, o: 0 }
  }
  return JSON.stringify({ t: encode({ data }), f: 127, m: [] })
}

/** URL のオリジン（スキーム、ホスト、ポート）を返す。k6 には URL のクラスが無い。 */
const originOf = (url) => /^[a-z]+:\/\/[^/]+/.exec(url)[0]

/** VU ごとに違う、送信元のアドレス。LOAD_CLIENT_IP_HEADER があるときだけ送る。 */
const clientIpHeaders = (n) =>
  CLIENT_IP_HEADER === ''
    ? {}
    : { [CLIENT_IP_HEADER]: `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` }

/**
 * Hydra の認可のエンドポイントから、ブローカーと開発用の IdP を通り、redirectTo で始まる URL に着くまで進む。
 * 手順は compose/dev-token.sh と同じである。着いた応答を返す。
 */
const signInFrom = (authorizeUrl, email, headers, redirectTo) => {
  const login = http.get(authorizeUrl, { headers, tags: { name: 'login:broker' } })
  const challenge = /[?&]login_challenge=([^&]+)/.exec(login.url)
  if (challenge === null) fail(`ブローカーのログインの画面に着かない: ${login.status} ${login.url}`)
  const upstream = http.post(
    `${originOf(login.url)}/login`,
    { login_challenge: decodeURIComponent(challenge[1]), email },
    { headers, tags: { name: 'login:email' } },
  )
  if (!upstream.url.includes('idp'))
    fail(`ブローカーが上流の IdP へ送らない: ${upstream.status} ${email}`)
  const res = http.post(
    upstream.url,
    { username: email.split('@')[0], claims: JSON.stringify({ email, email_verified: true }) },
    { headers, redirects: 20, tags: { name: 'login:idp' } },
  )
  if (redirectTo !== undefined && !res.url.startsWith(redirectTo))
    fail(`ログインの後に ${redirectTo} に着かない: ${res.url}`)
  return res
}

/** マネージャーの access token を、web を通さず Hydra の認可コードの交換で取る。 */
const managerAccessToken = () => {
  const redirectUri = `${WEB}/auth/callback`
  const authorize = `${HYDRA}/oauth2/auth?client_id=web&response_type=code&scope=openid+email+offline_access&state=load-setup-state&redirect_uri=${encodeURIComponent(redirectUri)}`
  const login = http.get(authorize, { tags: { name: 'setup' } })
  const challenge = /[?&]login_challenge=([^&]+)/.exec(login.url)
  if (challenge === null) fail(`ブローカーのログインの画面に着かない: ${login.url}`)
  const upstream = http.post(`${originOf(login.url)}/login`, {
    login_challenge: decodeURIComponent(challenge[1]),
    email: MANAGER_EMAIL,
  })
  let res = http.post(
    upstream.url,
    {
      username: MANAGER_EMAIL.split('@')[0],
      claims: JSON.stringify({ email: MANAGER_EMAIL, email_verified: true }),
    },
    { redirects: 0 },
  )
  while (!(res.headers.Location || '').startsWith(redirectUri)) {
    const location = res.headers.Location
    if (!location) fail(`認可コードに着かない: ${res.status} ${res.url}`)
    res = http.get(location.startsWith('/') ? originOf(res.url) + location : location, {
      redirects: 0,
    })
  }
  const code = /[?&]code=([^&]+)/.exec(res.headers.Location)[1]
  const token = http.post(
    `${HYDRA}/oauth2/token`,
    { grant_type: 'authorization_code', code: decodeURIComponent(code), redirect_uri: redirectUri },
    { headers: { Authorization: `Basic ${b64encode('web:web-dev')}` } },
  )
  if (token.status !== 200) fail(`Hydra からトークンを取れない: ${token.status}`)
  return token.json('access_token')
}

/** 負荷用の職員を USERS 人登録し、メールの一覧を返す。メールには流した時刻を入れ、回ごとに違う職員にする。 */
export function setup() {
  const token = managerAccessToken()
  const stamp = Date.now()
  const emails = []
  for (let i = 0; i < USERS; i++) {
    const email = `load.${stamp}.${i}@example.com`
    const res = http.post(
      `${SCHEDULE}/v1/facilities/${STAFF_FORM.facilityId}/users`,
      JSON.stringify({
        username: `負荷 ${stamp} ${i}`,
        email,
        department_id: STAFF_FORM.departmentId,
        team_id: STAFF_FORM.teamId,
        position_id: STAFF_FORM.positionId,
      }),
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        tags: { name: 'setup:register' },
      },
    )
    if (res.status !== 201 && res.status !== 200)
      fail(`職員を登録できない: ${res.status} ${res.body}`)
    emails.push(email)
  }
  return { emails, startedAt: Date.now() }
}

/** BFF の応答の本文から、callBff が返した ok を読む。seroval の JSON の ok のキーの値が true（t: 2, s: 2）かを見る。 */
const bffOk = (body) => /"k":\["ok"[^\]]*\],"v":\[\{"t":2,"s":2\}/.test(body || '')

/**
 * 1 人の職員の使い方を、LOAD_DURATION_S の間流す。ログインの窓の中で VU の番号の順にログインし、ログアウトの時刻まで BFF を呼び続ける。
 * ログインに失敗したら login_failed に数え、画面の操作をせずに終える。
 */
export default function (data) {
  const n = exec.vu.idInTest - 1
  const email = data.emails[n]
  const headers = clientIpHeaders(n)
  const loginAt = data.startedAt + (LOGIN_WINDOW_S * 1000 * n) / USERS
  const logoutAt = data.startedAt + DURATION_S * 1000
  sleep(Math.max(0, loginAt - Date.now()) / 1000)

  const loginStart = Date.now()
  let landed
  try {
    landed = signInFrom(`${WEB}/auth/login?returnTo=%2Fschedule`, email, headers, `${WEB}/schedule`)
  } catch (error) {
    console.error(String(error))
  }
  const loggedIn = check(landed, {
    ログインして予定の画面に着く: (r) => r !== undefined && r.status === 200,
  })
  if (!loggedIn) {
    loginFailed.add(1)
    return
  }
  loginDuration.add(Date.now() - loginStart)

  const bffHeaders = {
    ...headers,
    'Content-Type': 'application/json',
    Accept: 'application/x-tss-framed, application/x-ndjson, application/json',
    Origin: WEB,
    'x-tsr-serverfn': 'true',
  }
  let i = 0
  while (Date.now() < logoutAt) {
    const calls = scheduleScreenCalls()
    const call = calls[i++ % calls.length]
    const res = http.post(CALL_BFF_URL, serovalBody(call), {
      headers: bffHeaders,
      tags: { name: `bff:${call.op}` },
    })
    bffDuration.add(res.timings.duration, { op: call.op })
    if (!check(res, { 'BFF が ok を返す': (r) => r.status === 200 && bffOk(r.body) }))
      bffFailed.add(1, { op: call.op })
    sleep(Math.min((logoutAt - Date.now()) / 1000, READ_INTERVAL_S * (0.5 + Math.random())))
  }

  // ログアウトは web のセッションを消すところまで測る。Hydra とブローカーのログアウトへは進まない
  const out = http.post(`${WEB}/auth/logout`, null, {
    headers: { ...headers, Origin: WEB },
    redirects: 0,
    tags: { name: 'logout' },
  })
  check(out, { 'ログアウトで web のセッションを消す': (r) => r.status === 302 })
}
