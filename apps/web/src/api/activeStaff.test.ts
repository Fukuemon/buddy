import { describe, expect, it } from 'vite-plus/test'

import { isActiveStaff, isActiveStaffRecord } from './activeStaff'
import type { Staff, StaffRecord } from './types'

const staff = (over: Partial<Staff>): Staff => ({ id: 's', name: '職員', ...over }) as Staff
const record = (over: Partial<StaffRecord>): StaffRecord =>
  ({ id: 's', username: '職員', status: 'active', visits: true, ...over }) as StaffRecord

describe('isActiveStaff と isActiveStaffRecord', () => {
  it.each([
    ['有効で訪問する', staff({}), record({}), true],
    ['休職', staff({ status: 'on_leave' }), record({ status: 'on_leave' }), false],
    ['退職', staff({ status: 'retired' }), record({ status: 'retired' }), false],
    ['訪問しない', staff({ nonVisiting: true }), record({ visits: false }), false],
  ])('%s職員は、画面の型と API の型で同じ値を返す', (_, view, api, expected) => {
    expect(isActiveStaff(view)).toBe(expected)
    expect(isActiveStaffRecord(api)).toBe(expected)
  })
})
