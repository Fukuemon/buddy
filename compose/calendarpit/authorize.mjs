// calendarpit の同意の画面を通して予定の API と照合の API が使う refresh token を取り、Application Default Credentials の形（authorized_user）で書く。
// calendarpit はサービスアカウントの token を出さないので、予定の API と照合の API は fixture の利用者 schedule-api として Calendar API を呼ぶ。
//
//	node authorize.mjs <calendarpit の URL> <書き出すファイル>（compose では bun で流す）
//
// 値は全て compose/calendarpit/fixture.json の client と利用者で、ローカル環境だけで使う。
import { writeFileSync } from 'node:fs'

const [origin, out] = process.argv.slice(2)
if (!origin || !out) {
  console.error('usage: node authorize.mjs <calendarpit の URL> <書き出すファイル>')
  process.exit(2)
}

const client = {
  id: 'schedule-api',
  secret: 'schedule-api-local',
  redirectUri: 'http://127.0.0.1/callback',
}

const authorize = new URL('/oauth/authorize', origin)
authorize.search = new URLSearchParams({
  client_id: client.id,
  redirect_uri: client.redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/calendar.events',
  access_type: 'offline',
}).toString()
const page = await fetch(authorize)
const nonce = /name="consent" value="([^"]+)"/.exec(await page.text())?.[1]
if (!page.ok || !nonce) throw new Error(`同意の画面を開けない: ${page.status}`)

const decided = await fetch(new URL('/oauth/authorize', origin), {
  method: 'POST',
  body: new URLSearchParams({ consent: nonce, user_id: 'schedule-api', decision: 'approve' }),
  redirect: 'manual',
})
const code = new URL(decided.headers.get('location') ?? '', client.redirectUri).searchParams.get(
  'code',
)
if (!code) throw new Error(`同意できない: ${decided.status}`)

const token = await fetch(new URL('/oauth/token', origin), {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: client.redirectUri,
    code,
  }),
})
const { refresh_token: refreshToken } = await token.json()
if (!token.ok || !refreshToken) throw new Error(`token を取れない: ${token.status}`)

writeFileSync(
  out,
  JSON.stringify({
    type: 'authorized_user',
    client_id: client.id,
    client_secret: client.secret,
    refresh_token: refreshToken,
    token_uri: new URL('/oauth/token', origin).toString(),
  }),
)
console.log(`wrote ${out}`)
