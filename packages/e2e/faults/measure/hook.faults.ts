// hook のスタブが決まった答えを返すときの、Hydra と web の動き。
import { expect, test } from '@playwright/test'

import { clientCredentialsInsideCompose, setStubMode, listStubCalls } from '../lib/compose'
import { formatCall, report } from '../lib/results'
import { restoreAll } from '../lib/restore'
import {
  getMe,
  clientCredentials,
  exchangeCode,
  login,
  createApiContext,
  refresh,
} from '../lib/tokens'
import {
  formatWebObservation,
  openAfterExpiry,
  recoversWithoutLogin,
  registerFaultStaff,
  signInWeb,
} from '../lib/web'

test.afterEach(restoreAll)

test('hook の 500: Hydra が 3 回呼んで約 3 秒で 500 になり、refresh token と認可コードを使い切らない', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('hook500')
  const request = await createApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode({ status: 500 })
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const refreshCalls = listStubCalls().length
  const api = await getMe(request, before.tokens.accessToken)
  const cc = await clientCredentials(request)
  const newLogin = await login(request, staff.email)
  const webSeen = await openAfterExpiry(web.context, web.page)

  setStubMode()
  const after = await refresh(request, before.tokens.refreshToken)
  const codeAfter =
    !newLogin.ok && newLogin.code ? await exchangeCode(request, newLogin.code) : undefined
  const recovered = await recoversWithoutLogin(web.page)

  report('hook の 500', [
    { label: 'refresh', value: formatCall(refreshed), basis: '#877' },
    { label: 'refresh で Hydra が hook を呼んだ回数', value: `${refreshCalls} 回`, basis: '#877' },
    { label: '既発行の JWT で予定の API', value: formatCall(api), basis: '#877' },
    { label: 'client credentials', value: formatCall(cc), basis: '#877' },
    {
      label: '新しいログイン',
      value: newLogin.ok
        ? '通った'
        : `${newLogin.step} で失敗${newLogin.exchange ? `、${formatCall(newLogin.exchange)}` : ''}`,
      basis: '#877',
    },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: formatCall(after),
      basis: '#877',
    },
    {
      label: '戻した後の、失敗した認可コードの交換',
      value: codeAfter ? formatCall(codeAfter) : '交換まで進まなかった',
      basis: '#877',
    },
    {
      label: 'web の access token が切れた表示',
      value: formatWebObservation(webSeen),
      basis: 'ADR',
    },
    {
      label: 'web を戻した後',
      value: recovered ? 'ログインし直さずに出た' : '出ない',
      basis: 'ADR',
    },
  ])

  expect.soft(refreshed.status).toBe(500)
  expect.soft(refreshed.error).toBe('server_error')
  expect.soft(refreshCalls).toBe(3)
  expect.soft(refreshed.seconds).toBeGreaterThan(2.5)
  expect.soft(refreshed.seconds).toBeLessThan(5)
  expect.soft(api.status).toBe(200)
  expect.soft(cc.status).toBe(500)
  expect.soft(newLogin.ok ? 0 : newLogin.exchange?.status).toBe(500)
  expect.soft(after.status).toBe(200)
  expect.soft(codeAfter?.status).toBe(200)
  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.refreshLog).toContain('reason=hydra_error')
  expect.soft(recovered).toBe(true)
  await web.context.close()
  await request.dispose()
})

test('hook の 403: Hydra は呼び直さずに 403 で拒み、web はセッションを消す', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('hook403')
  const request = await createApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode({ status: 403 })
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const refreshCalls = listStubCalls().length
  const api = await getMe(request, before.tokens.accessToken)
  const cc = await clientCredentials(request)
  const newLogin = await login(request, staff.email)
  const webSeen = await openAfterExpiry(web.context, web.page)

  setStubMode()
  const after = await refresh(request, before.tokens.refreshToken)

  report('hook の 403', [
    { label: 'refresh', value: formatCall(refreshed), basis: '#877' },
    { label: 'refresh で Hydra が hook を呼んだ回数', value: `${refreshCalls} 回`, basis: '#877' },
    { label: '既発行の JWT で予定の API', value: formatCall(api), basis: '#877' },
    { label: 'client credentials', value: formatCall(cc), basis: '#877' },
    {
      label: '新しいログイン',
      value: newLogin.ok
        ? '通った'
        : `${newLogin.step} で失敗${newLogin.exchange ? `、${formatCall(newLogin.exchange)}` : ''}`,
      basis: '#877',
    },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: formatCall(after),
      basis: '#877',
    },
    {
      label: 'web の access token が切れた表示',
      value: formatWebObservation(webSeen),
      basis: 'ADR',
    },
  ])

  expect.soft(refreshed.status).toBe(403)
  expect.soft(refreshed.error).toBe('access_denied')
  expect.soft(refreshCalls).toBe(1)
  expect.soft(refreshed.seconds).toBeLessThan(1)
  expect.soft(api.status).toBe(200)
  expect.soft(cc.status).toBe(403)
  expect.soft(newLogin.ok ? 0 : newLogin.exchange?.status).toBe(403)
  expect.soft(after.status).toBe(200)
  expect.soft(webSeen.outcome).toBe('login-failed')
  expect.soft(webSeen.sessionKept).toBe(false)
  expect.soft(webSeen.refreshLog).toContain('reason=rejected')
  await web.context.close()
  await request.dispose()
})

test('hook の 501: Hydra が呼び直すかと、失敗が決まるまでの秒を記録する', async () => {
  const staff = await registerFaultStaff('hook501')
  const request = await createApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)

  setStubMode({ status: 501 })
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const refreshCalls = listStubCalls().length
  // ブローカーの DB の待ちの上限の 2 秒の後に 501 を返す形も測る。ADR-0044 の 500 を 501 に変えたときの、DB が答えない場合に当たる
  setStubMode({ status: 501, delayMs: 2_000 })
  const slow = await refresh(request, before.tokens.refreshToken)
  const slowCalls = listStubCalls().length

  setStubMode()
  const after = await refresh(request, before.tokens.refreshToken)

  report('hook の 501', [
    { label: 'refresh', value: formatCall(refreshed), basis: '記録だけ' },
    {
      label: 'refresh で Hydra が hook を呼んだ回数',
      value: `${refreshCalls} 回`,
      basis: '記録だけ',
    },
    { label: '2 秒待って 501 のときの refresh', value: formatCall(slow), basis: '記録だけ' },
    { label: '2 秒待って 501 のときの hook の回数', value: `${slowCalls} 回`, basis: '記録だけ' },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: formatCall(after),
      basis: '記録だけ',
    },
  ])
  await request.dispose()
})

test(
  'hook が答えない: Hydra は 30 秒を 3 回待ち、答えを返さずに接続を切る',
  { tag: '@slow' },
  async () => {
    const staff = await registerFaultStaff('hookhang')
    const request = await createApiContext()
    const before = await login(request, staff.email)
    if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)

    setStubMode({ hang: true })
    // 約 93 秒の待ちを 1 回で済ませるため、portless を通した refresh と、compose の中からの client credentials を並べる
    const [refreshed, inside] = await Promise.all([
      refresh(request, before.tokens.refreshToken),
      clientCredentialsInsideCompose(),
    ])
    const calls = listStubCalls()

    setStubMode()
    const after = await refresh(request, before.tokens.refreshToken)

    report('hook が答えない', [
      {
        label: 'compose の中から Hydra を直に呼んだ client credentials',
        value: formatCall(inside),
        basis: '#877',
      },
      {
        label: 'portless を通した refresh（portless が、切れた接続を 502 にする）',
        value: formatCall(refreshed),
        basis: '記録だけ',
      },
      {
        label: '2 つの要求で Hydra が hook を呼んだ回数',
        value: `${calls.length} 回`,
        basis: '#877',
      },
      {
        label: 'Hydra が 1 回の hook を待った秒',
        value: calls
          .map((c) =>
            c.closedAt ? `${Math.round((c.closedAt - c.receivedAt) / 100) / 10}` : '切らない',
          )
          .join('、'),
        basis: '#877',
      },
      {
        label: '戻した後の、同じ refresh token の refresh',
        value: formatCall(after),
        basis: '#877',
      },
    ])

    expect.soft(calls.length).toBe(6)
    expect
      .soft(
        calls.map((c) =>
          c.closedAt === null ? null : Math.round((c.closedAt - c.receivedAt) / 1000),
        ),
      )
      .toEqual([30, 30, 30, 30, 30, 30])
    expect.soft(inside.status).toBeNull()
    expect.soft(inside.seconds).toBeGreaterThan(85)
    expect.soft(inside.seconds).toBeLessThan(110)
    expect.soft(refreshed.status === 200).toBe(false)
    expect.soft(refreshed.seconds).toBeGreaterThan(85)
    expect.soft(after.status).toBe(200)
    await request.dispose()
  },
)

test('BFF が 5 秒で切った後に、Hydra が残りの hook の呼び直しを止めるかを記録する', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('hookabort')
  const web = await signInWeb(browser, staff.email)

  // 1 回目は 0〜2.5 秒、2 回目は約 3.5〜6 秒に答える。BFF は 2 回目の途中の 5 秒で切り、止めなければ 3 回目が約 8 秒に届く
  setStubMode({ status: 500, delayMs: 2_500 })
  const start = Date.now()
  const webSeen = await openAfterExpiry(web.context, web.page)
  // 呼び直しが残っていれば届く時刻（約 8 秒）を過ぎ、3 回目の 2.5 秒の待ちも終わるまで、スタブの記録を読み直す
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, start + 14_000 - Date.now())))
  const calls = listStubCalls()

  setStubMode()
  const recovered = await recoversWithoutLogin(web.page)

  const at = (ms: number | null) => (ms === null ? '-' : `${Math.round((ms - start) / 100) / 10}`)
  report('BFF が 5 秒で切った後の Hydra の呼び直し', [
    {
      label: 'web の access token が切れた表示',
      value: formatWebObservation(webSeen),
      basis: 'ADR',
    },
    { label: 'スタブが受けた hook の回数', value: `${calls.length} 回`, basis: '記録だけ' },
    {
      label: 'hook ごとの、受けた秒、答えた秒、Hydra が切った秒（表示を開いてから）',
      value: calls
        .map((c) => `${at(c.receivedAt)}/${at(c.respondedAt)}/${at(c.closedAt)}`)
        .join('、'),
      basis: '記録だけ',
    },
    {
      label: 'web を戻した後',
      value: recovered ? 'ログインし直さずに出た' : '出ない',
      basis: 'ADR',
    },
  ])

  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.refreshLog).toContain('reason=timeout')
  expect.soft(recovered).toBe(true)
  await web.context.close()
})
