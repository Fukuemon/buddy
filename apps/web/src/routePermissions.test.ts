import { createRouter, type AnyRoute } from '@tanstack/react-router'
import { describe, expect, it } from 'vite-plus/test'

import type { Permission, PermissionCheck } from '#/api/permissions'
import type { AppRouterContext } from '#/appContext'

import { routeTree } from './routeTree.gen'

// route の ID は、router を作るときに決まる。route を読むだけなので、context の中身は使わない
const { routesById } = createRouter({ routeTree, context: {} as AppRouterContext })

/** 画面を持つ route。root の route（画面の枠）と、ログインの前と失敗の画面（/auth/ の下）は、職員を求めないので外す。 */
const screenRoutes = Object.values(routesById as unknown as Record<string, AnyRoute>).filter(
  (route) =>
    route.options.component !== undefined && !route.isRoot && !route.id.startsWith('/auth/'),
)

const declaredPermission = (route: AnyRoute): Permission | undefined =>
  (route.options.beforeLoad as Partial<PermissionCheck> | undefined)?.permission

describe('route の権限の宣言', () => {
  it('画面を持つ route を見つける', () => {
    expect(screenRoutes.length).toBeGreaterThan(10)
  })

  it.each(screenRoutes.map((route) => [route.id, route] as const))(
    '%s は、beforeLoad の requirePermission で画面に要る権限を宣言する',
    (_, route) => {
      expect(declaredPermission(route)).toBeDefined()
    },
  )

  it('職員の管理と照合の画面に、要る権限を宣言する', () => {
    const declared = Object.fromEntries(
      screenRoutes.map((route) => [route.id, declaredPermission(route)]),
    )
    expect(declared).toMatchObject({
      '/staff': 'staff.manage',
      '/staff_/$staffId': 'staff.manage',
      '/patients': 'staff.manage',
      '/organization': 'staff.manage',
      '/schedule_/import': 'staff.manage',
      '/schedule_/link': 'staff.manage',
      '/schedule_/review': 'staff.manage',
      '/receipt/': 'receipt.check',
      '/receipt/result': 'receipt.check',
      '/schedule': 'none',
    })
  })
})
