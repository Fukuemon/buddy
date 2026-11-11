// 止めた職員が、新しいトークンも refresh したトークンも取れないこと。止め方ごとに、どこで拒むかを測る。
import { expect, test } from '@playwright/test'

import { leaveStaff } from '../../tests/fixtures/staff'
import { setBrokerStaffStatus, setStubMode, stubCalls } from '../lib/compose'
import { describeCall, report } from '../lib/results'
import { restoreAll } from '../lib/restore'
import { login, newApiContext, refresh } from '../lib/tokens'
import { registerFaultStaff } from '../lib/web'

test.afterEach(restoreAll)

test('予定の API で休職にした職員: refresh は hook より前に invalid_grant で拒まれ、ログインも拒まれる', async () => {
  const staff = await registerFaultStaff('staffleave')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`休職の前にログインできない: ${before.step}`)

  expect((await leaveStaff(request, staff.managerToken, staff.id)).status()).toBe(200)
  setStubMode()
  const refreshed = await refresh(request, before.tokens.refreshToken)
  const calls = stubCalls().length
  const newLogin = await login(request, staff.email)

  report('予定の API で休職にした職員', [
    { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
    { label: 'refresh で Hydra が hook を呼んだ回数', value: `${calls} 回`, basis: '#877' },
    {
      label: '新しいログイン',
      value: newLogin.ok ? '通った' : `${newLogin.step} で拒まれた`,
      basis: '#877',
    },
  ])

  expect.soft(refreshed.status).toBe(400)
  expect.soft(refreshed.error).toBe('invalid_grant')
  expect.soft(calls).toBe(0)
  expect.soft(newLogin.ok ? '' : newLogin.step).toBe('broker-login')
  await request.dispose()
})

test('ブローカーの DB の状態だけを suspended にした職員: refresh token は残るが、hook が access_denied で拒む', async () => {
  const staff = await registerFaultStaff('staffdb')
  const request = await newApiContext()
  const before = await login(request, staff.email)
  if (!before.ok) throw new Error(`止める前にログインできない: ${before.step}`)

  setBrokerStaffStatus(staff.email, 'suspended')
  try {
    setStubMode()
    const refreshed = await refresh(request, before.tokens.refreshToken)
    const calls = stubCalls().length
    const newLogin = await login(request, staff.email)

    report('ブローカーの DB の状態だけを suspended にした職員', [
      { label: 'refresh', value: describeCall(refreshed), basis: '#877' },
      { label: 'refresh で Hydra が hook を呼んだ回数', value: `${calls} 回`, basis: '#877' },
      {
        label: '新しいログイン',
        value: newLogin.ok ? '通った' : `${newLogin.step} で拒まれた`,
        basis: '#877',
      },
    ])

    expect.soft(refreshed.status).toBe(403)
    expect.soft(refreshed.error).toBe('access_denied')
    expect.soft(calls).toBe(1)
    expect.soft(newLogin.ok ? '' : newLogin.step).toBe('broker-login')
  } finally {
    setBrokerStaffStatus(staff.email, 'active')
    await request.dispose()
  }
})
