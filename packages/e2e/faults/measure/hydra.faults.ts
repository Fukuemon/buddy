// Hydra とその DB が止まったときの、予定の API と web の動き。
import { expect, test } from '@playwright/test'

import {
  blockDatabase,
  restartService,
  restoreService,
  setStubMode,
  stopService,
  unblockDatabase,
} from '../lib/compose'
import { describeCall, report } from '../lib/results'
import { restoreAll, waitHealthy } from '../lib/restore'
import {
  callScheduleApi,
  clientCredentials,
  login,
  newApiContext,
  refresh,
  scheduleReady,
} from '../lib/tokens'
import {
  describeWeb,
  openAfterExpiry,
  recoversWithoutLogin,
  registerFaultStaff,
  signInWeb,
} from '../lib/web'

test.afterEach(restoreAll)

/** Hydra を戻してから、予定の API の /readyz が 200 になるまで待つ上限。読み直しの 5 秒と 1 回の読み込みの上限の 10 秒に余裕を足す。 */
const READY_WAIT_MS = 30_000

test('Hydra の停止: 既発行の JWT は通り、Hydra が止まった間に起動した予定の API は 503 を返し、戻すと 200 になる', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('hydrastop')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode()
  stopService('hydra')
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const api = await callScheduleApi(request, before.tokens.accessToken)
  const webSeen = await openAfterExpiry(web.context, web.page)
  restartService('schedule')
  // 再起動した予定の API が待ち受けるまで待つ。待ち受ける前は、portless が 502 を返すか、接続が切れる。
  // discovery を読めないので、compose のヘルスチェックは通らない
  await expect
    .poll(async () => (await scheduleReady(request)).status, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(200)
  await expect
    .poll(async () => (await scheduleReady(request)).status, { timeout: 30_000 })
    .not.toBe(502)
  const readyDown = await scheduleReady(request)
  const apiDown = await callScheduleApi(request, before.tokens.accessToken)

  const restartedAt = Date.now()
  restoreService('hydra')
  await waitHealthy('hydra')
  const hydraReadyAt = Date.now()
  await expect
    .poll(async () => (await scheduleReady(request)).status, {
      timeout: READY_WAIT_MS,
      intervals: [500],
    })
    .toBe(200)
  const readySeconds = Math.round((Date.now() - hydraReadyAt) / 100) / 10
  const after = await refresh(request, before.tokens.refreshToken)
  const recovered = await recoversWithoutLogin(web.page)

  report('Hydra の停止', [
    { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
    { label: '既発行の JWT で予定の API', value: describeCall(api), basis: '#877' },
    { label: 'web の access token が切れた表示', value: describeWeb(webSeen), basis: 'ADR' },
    {
      label: 'Hydra が止まった間に再起動した予定の API の /readyz',
      value: describeCall(readyDown),
      basis: 'ADR',
    },
    { label: '同じ予定の API に、既発行の JWT で呼ぶ', value: describeCall(apiDown), basis: 'ADR' },
    {
      label: 'Hydra のヘルスチェックが通ってから、予定の API の /readyz が 200 になるまで',
      value: `${readySeconds} 秒（Hydra の起動に ${Math.round((hydraReadyAt - restartedAt) / 100) / 10} 秒）`,
      basis: 'ADR',
    },
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

  expect.soft(refreshed.status === 200).toBe(false)
  expect.soft(api.status).toBe(200)
  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.refreshLog).toContain('reason=unreachable')
  expect.soft(readyDown.status).toBe(503)
  expect.soft(apiDown.status).toBe(503)
  expect.soft(apiDown.error).toBe('auth_unavailable')
  expect.soft(readySeconds).toBeLessThan(16)
  expect.soft(after.status).toBe(200)
  expect.soft(recovered).toBe(true)
  await web.context.close()
  await request.dispose()
})

test('Hydra の DB の停止: Hydra は refresh に 401 の invalid_client を返し、web はセッションを残す', async ({
  browser,
}) => {
  const staff = await registerFaultStaff('hydradb')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`故障の前にログインできない: ${before.step}`)
  const web = await signInWeb(browser, staff.email)

  setStubMode()
  blockDatabase('hydra')
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const api = await callScheduleApi(request, before.tokens.accessToken)
  const cc = await clientCredentials(request)
  const newLogin = await login(request, staff.email)
  const webSeen = await openAfterExpiry(web.context, web.page)

  unblockDatabase('hydra')
  await waitHealthy('hydra')
  const after = await refresh(request, before.tokens.refreshToken)
  const recovered = await recoversWithoutLogin(web.page)

  report('Hydra の DB の停止（hydra のデータベースへの接続を拒む）', [
    { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
    { label: '既発行の JWT で予定の API', value: describeCall(api), basis: '#877' },
    { label: 'client credentials', value: describeCall(cc), basis: '#877' },
    {
      label: '新しいログイン',
      value: newLogin.ok
        ? '通った'
        : `${newLogin.step} で失敗${newLogin.failure ? `（${newLogin.failure}）` : ''}`,
      basis: '#877',
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

  expect.soft(refreshed.status).toBe(401)
  expect.soft(refreshed.error).toBe('invalid_client')
  expect.soft(api.status).toBe(200)
  expect.soft(cc.status).toBe(401)
  expect.soft(newLogin.ok).toBe(false)
  expect.soft(webSeen.sessionKept).toBe(true)
  expect.soft(webSeen.outcome).toBe('unavailable')
  expect.soft(after.status).toBe(200)
  expect.soft(recovered).toBe(true)
  await web.context.close()
  await request.dispose()
})
