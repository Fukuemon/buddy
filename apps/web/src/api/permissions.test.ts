import { describe, expect, it } from 'vite-plus/test'

import { FAKE_VIEWER } from './fake/fixtures'
import {
  PermissionDeniedError,
  deniedPermissionOf,
  hasPermission,
  requirePermission,
  type Permission,
} from './permissions'
import type { Viewer } from './types'

const viewerWith = (policyCodes: readonly string[]): Viewer => ({ ...FAKE_VIEWER, policyCodes })

describe('hasPermission', () => {
  it.each<[string, Viewer | null, Permission, boolean]>([
    ['職員の管理の権限を持つ', viewerWith(['staff.manage']), 'staff.manage', true],
    ['照合の権限を持つ', viewerWith(['receipt.check']), 'receipt.check', true],
    ['ほかの権限だけを持つ', viewerWith(['receipt.check']), 'staff.manage', false],
    ['予定の権限だけを持つ', viewerWith(['schedule.all.edit']), 'receipt.check', false],
    ['権限の一覧が空', viewerWith([]), 'staff.manage', false],
    ['権限の一覧が空で、権限の要らない画面', viewerWith([]), 'none', true],
    ['ログインしていない', null, 'staff.manage', false],
    ['ログインしていなくて、権限の要らない画面', null, 'none', true],
  ])('%s職員は、%s の権限で %s を返す', (_, viewer, permission, expected) => {
    expect(hasPermission(viewer, permission)).toBe(expected)
  })
})

describe('requirePermission', () => {
  it('権限を持てば、viewer を context に返す', () => {
    const viewer = viewerWith(['staff.manage'])
    expect(requirePermission('staff.manage')({ context: { viewer } })).toEqual({ viewer })
  })

  it('ログインしていなければ、PermissionDeniedError を投げる', () => {
    expect(() => requirePermission('staff.manage')({ context: { viewer: null } })).toThrow(
      PermissionDeniedError,
    )
  })

  it('権限が無ければ、足りない権限を持つ PermissionDeniedError を投げる', () => {
    const check = requirePermission('receipt.check')
    expect(() => check({ context: { viewer: viewerWith(['staff.manage']) } })).toThrow(
      PermissionDeniedError,
    )
  })

  it("'none' は、権限の一覧が空でも投げず、何も返さない", () => {
    expect(requirePermission('none')({ context: { viewer: viewerWith([]) } })).toBeUndefined()
  })

  it('宣言した権限を、route の宣言のテストが読めるように持つ', () => {
    expect(requirePermission('staff.manage').permission).toBe('staff.manage')
  })
})

describe('deniedPermissionOf', () => {
  it('PermissionDeniedError から、足りない権限を返す', () => {
    expect(deniedPermissionOf(new PermissionDeniedError('receipt.check'))).toBe('receipt.check')
  })

  it('サーバーで描いた後の、message だけが残ったエラーからも、足りない権限を返す', () => {
    const { message } = new PermissionDeniedError('staff.manage')
    expect(deniedPermissionOf(new Error(message))).toBe('staff.manage')
  })

  it('ほかのエラーと、知らない権限の名前のエラーでは undefined を返す', () => {
    expect(deniedPermissionOf(new Error('boom'))).toBeUndefined()
    expect(deniedPermissionOf(new Error('permission-denied:x.y'))).toBeUndefined()
    expect(deniedPermissionOf('permission-denied:staff.manage')).toBeUndefined()
  })
})
