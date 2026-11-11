// Hydra の token_hook とブローカーの間に置く、故障を入れるスタブ。測定のときだけ compose.faults.yml が起動する。
// 本番のコードに故障の道を作らないため、テストのディレクトリに置く（ADR-0044 の監視と復旧）。
//
// 8081 で hook を受ける。既定はブローカーへの素通しで、故障の答え方は 9000 の操作の口で切り替える。
// 操作の口は 127.0.0.1 だけで待ち受け、docker exec で呼ぶ。ホストのポートを開けない。
//   GET /mode?status=500&delay_ms=2000  2 秒待ってから 500 を返す。status を省くと、待った後にブローカーへ渡す
//   GET /mode?hang=1                    接続を受けたまま答えない
//   GET /mode                           素通しに戻す
//   GET /calls                          受けた hook の一覧（受けた時刻、答えた時刻、クライアントが切った時刻、返した状態コード）
//   GET /reset                          受けた hook の一覧を空にする
import http from 'node:http'

const BROKER_HOOK_URL = process.env.BROKER_HOOK_URL ?? 'http://broker:8081/internal/token-hook'

/** 今の答え方。status が null なら、delayMs だけ待ってからブローカーへ渡す。 */
let mode = { status: null, delayMs: 0, hang: false }

/** 受けた hook の一覧。時刻はエポックからのミリ秒である。 */
let calls = []

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

/** ブローカーへ同じ本文とヘッダーで渡し、ブローカーの答えを返す。鍵のヘッダー（Token-Hook-Key）もそのまま渡す。 */
const forward = async (req, body) => {
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!['host', 'content-length', 'connection'].includes(k)) headers[k] = v
  }
  const res = await fetch(BROKER_HOOK_URL, { method: req.method, headers, body })
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) }
}

/** hook を受けて、今の答え方で答える。例外でスタブのプロセスが落ちないよう、失敗は 502 にして記録する。 */
const answerHook = async (req, res, call) => {
  const current = mode
  const body = await readBody(req)
  if (current.hang) return
  if (current.delayMs > 0) await sleep(current.delayMs)
  if (call.closedAt !== null) return
  let answer
  if (current.status === null) {
    try {
      answer = await forward(req, body)
    } catch {
      answer = { status: 502, body: Buffer.from('broker unreachable') }
    }
  } else {
    answer = { status: current.status, body: Buffer.from('{"error":"injected by hook-stub"}') }
  }
  call.status = answer.status
  call.respondedAt = Date.now()
  res.writeHead(answer.status, { 'content-type': 'application/json' })
  res.end(answer.body)
}

const hook = http.createServer((req, res) => {
  const call = { receivedAt: Date.now(), respondedAt: null, closedAt: null, status: null }
  calls.push(call)
  // クライアント（Hydra）が答えを待たずに切ったら記録する。答えた後の close は数えない
  res.on('close', () => {
    if (call.respondedAt === null) call.closedAt = Date.now()
  })
  answerHook(req, res, call).catch(() => {
    call.status = 502
    call.respondedAt = Date.now()
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
})

const control = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const reply = (value) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  if (url.pathname === '/mode') {
    const status = url.searchParams.get('status')
    const delayMs = Number(url.searchParams.get('delay_ms') ?? 0)
    const valid =
      (status === null ||
        (/^\d{3}$/.test(status) && Number(status) >= 100 && Number(status) <= 599)) &&
      Number.isInteger(delayMs) &&
      delayMs >= 0
    if (!valid) {
      res.writeHead(400)
      return res.end()
    }
    mode = {
      status: status === null ? null : Number(status),
      delayMs,
      hang: url.searchParams.get('hang') === '1',
    }
    return reply(mode)
  }
  if (url.pathname === '/calls') return reply(calls)
  if (url.pathname === '/reset') {
    calls = []
    return reply({ ok: true })
  }
  res.writeHead(404)
  res.end()
})

hook.listen(8081)
control.listen(9000, '127.0.0.1')
