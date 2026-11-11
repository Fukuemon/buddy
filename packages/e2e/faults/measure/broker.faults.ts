// ブローカーとその DB が止まったときの、Hydra と web の動き。hook のスタブは素通しにしておく。
import { expect, test } from '@playwright/test'

import {
  blockDatabase,
  brokerStaffLocked,
  lockBrokerStaff,
  releaseBrokerStaffLock,
  serviceLogs,
  stopBroker,
  stubCalls,
  setStubMode,
  unblockDatabase,
} from '../lib/compose'
import { describeCall, report } from '../lib/results'
import { restoreAll, waitHealthy } from '../lib/restore'
import { callScheduleApi, clientCredentials, login, newApiContext, refresh } from '../lib/tokens'
import {
  describeWeb,
  openAfterExpiry,
  recoversWithoutLogin,
  registerFaultStaff,
  signInWeb,
} from '../lib/web'

test.afterEach(restoreAll)

const describeLogin = (r: Awaited<ReturnType<typeof login>>) =>
  r.ok
    ? '通った'
    : `${r.step} で失敗${r.exchange ? `、${describeCall(r.exchange)}` : ''}${r.failure ? `（${r.failure}）` : ''}`

test('ブローカーの停止: Hydra は約 3 秒で 500 にし、戻せば同じ refresh token が使える', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('brokerstop')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode()
  stopBroker()
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const calls = stubCalls()
  const api = await callScheduleApi(request, before.tokens.accessToken)
  const cc = await clientCredentials(request)
  const newLogin = await login(request, staff.email)
  const webSeen = await openAfterExpiry(web.context, web.page)

  await restoreAll()
  const after = await refresh(request, before.tokens.refreshToken)
  const recovered = await recoversWithoutLogin(web.page)

  report('ブローカーの停止', [
    { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
    {
      label:
        'refresh で Hydra が hook を呼んだ回数（スタブが受けた数。スタブはブローカーに届かず 502 を返す）',
      value: `${calls.length} 回`,
      basis: '#877',
    },
    { label: '既発行の JWT で予定の API', value: describeCall(api), basis: '#877' },
    { label: 'client credentials', value: describeCall(cc), basis: '#877' },
    { label: '新しいログイン', value: describeLogin(newLogin), basis: '#877' },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: describeCall(after),
      basis: '#877',
    },
    { label: 'web の access token が切れた表示', value: describeWeb(webSeen), basis: 'ADR' },
    {
      label: 'web を戻した後',
      value: recovered ? 'ログインし直さずに出た' : '出ない',
      basis: 'ADR',
    },
  ])

  expect.soft(refreshed.status).toBe(500)
  expect.soft(refreshed.error).toBe('server_error')
  expect.soft(calls.length).toBe(3)
  expect.soft(refreshed.seconds).toBeLessThan(5)
  expect.soft(api.status).toBe(200)
  expect.soft(cc.status).toBe(500)
  expect.soft(newLogin.ok ? '' : newLogin.step).toBe('broker-login')
  expect.soft(after.status).toBe(200)
  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.refreshLog).toContain('reason=hydra_error')
  expect.soft(recovered).toBe(true)
  await web.context.close()
  await request.dispose()
})

test('ブローカーの DB だけの停止: 接続を拒まれ、hook は約 3 秒で 500 になり、client credentials は通る', async () => {
  const staff = await registerFaultStaff('brokerdb')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)

  setStubMode()
  blockDatabase('broker')
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const calls = stubCalls()
  const cc = await clientCredentials(request)
  const newLogin = await login(request, staff.email)

  unblockDatabase('broker')
  await waitHealthy('broker')
  const after = await refresh(request, before.tokens.refreshToken)

  report('ブローカーの DB だけの停止（接続を拒む）', [
    { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
    {
      label: 'refresh で Hydra が hook を呼んだ回数と、ブローカーの答え',
      value: `${calls.length} 回（${calls.map((c) => c.status).join('、')}）`,
      basis: '#877',
    },
    { label: 'client credentials', value: describeCall(cc), basis: '#877' },
    { label: '新しいログイン', value: describeLogin(newLogin), basis: '#877' },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: describeCall(after),
      basis: '#877',
    },
  ])

  expect.soft(refreshed.status).toBe(500)
  expect.soft(calls.map((c) => c.status)).toEqual([500, 500, 500])
  expect.soft(refreshed.seconds).toBeLessThan(5)
  expect.soft(cc.status).toBe(200)
  expect.soft(newLogin.ok).toBe(false)
  expect.soft(after.status).toBe(200)
  await request.dispose()
})

test('ブローカーの DB が答えない: hook は 2 秒で打ち切って 500 を返し、約 9 秒で失敗が決まる。web は 5 秒で切る', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('brokerdbhang')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode()
  lockBrokerStaff(120)
  await expect.poll(brokerStaffLocked).toBe(true)
  const since = new Date()
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const calls = stubCalls()
  const webSeen = await openAfterExpiry(web.context, web.page)
  const hookLogs = serviceLogs('broker', since)
    .split('\n')
    .filter((l) => l.includes('token_hook の結果') && l.includes('"failed"'))
    .map((l) => /"duration_ms":(\d+)/.exec(l)?.[1])
    .filter((v) => v !== undefined)

  releaseBrokerStaffLock()
  const after = await refresh(request, before.tokens.refreshToken)
  const recovered = await recoversWithoutLogin(web.page)

  report('ブローカーの DB が答えない（staff のテーブルを握る）', [
    { label: 'refresh', value: describeCall(refreshed), basis: 'ADR' },
    {
      label: 'hook ごとの、ブローカーが答えるまでの秒',
      value: calls
        .map((c) =>
          c.respondedAt ? `${Math.round((c.respondedAt - c.receivedAt) / 100) / 10}` : '-',
        )
        .join('、'),
      basis: 'ADR',
    },
    {
      label: 'ブローカーのログの token_hook の結果（failed）の duration_ms',
      value: hookLogs.join('、') || '無し',
      basis: 'ADR',
    },
    { label: 'web の access token が切れた表示', value: describeWeb(webSeen), basis: 'ADR' },
    {
      label: '戻した後の、同じ refresh token の refresh',
      value: describeCall(after),
      basis: '#877',
    },
    {
      label: 'web を戻した後',
      value: recovered ? 'ログインし直さずに出た' : '出ない',
      basis: 'ADR',
    },
  ])

  expect.soft(refreshed.status).toBe(500)
  expect.soft(calls.length).toBe(3)
  expect.soft(refreshed.seconds).toBeGreaterThan(7)
  expect.soft(refreshed.seconds).toBeLessThan(11)
  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.refreshLog).toContain('reason=timeout')
  expect.soft(after.status).toBe(200)
  expect.soft(recovered).toBe(true)
  await web.context.close()
  await request.dispose()
})
