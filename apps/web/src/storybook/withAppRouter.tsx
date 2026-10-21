import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { Decorator } from '@storybook/react-vite'
import { useState, type ComponentType } from 'react'

import { ApiError, type BuddyApi, type ReceiptApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { createFakeReceiptApi } from '#/api/fake/fakeReceiptApi'
import { scheduleCreateSearchSchema } from '#/features/schedule/schema/scheduleCreateSearch'
import { scheduleSearchSchema } from '#/features/schedule/schema/scheduleSearch'
import type { AppRouterContext } from '#/integrations/tanstack-query/root-provider'

/** story を置く route。アプリの route の ID と同じにし、Container の useSearch と useNavigate が働くようにする。 */
export type StoryRouteId =
  | '/schedule'
  | '/schedule/new'
  | '/schedule/$scheduleId/'
  | '/schedule/$scheduleId/edit'
  | '/receipt/'
  | '/receipt/result'

export type AppRouterParameters = {
  /** story を置く route。 */
  route: StoryRouteId
  /** 最初に開く URL。search params もここに書く。 */
  url: string
  /** 偽物の API。既定は createFakeBuddyApi の初期の状態。 */
  api?: BuddyApi
  receiptApi?: ReceiptApi
  /** 描く前に query の cache に置く値。 */
  seed?: (queryClient: QueryClient) => void
}

const buildRouter = (Story: ComponentType, params: AppRouterParameters) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  params.seed?.(queryClient)
  const context: AppRouterContext = {
    queryClient,
    api: params.api ?? createFakeBuddyApi(),
    receiptApi: params.receiptApi ?? createFakeReceiptApi(),
    mode: 'fake',
  }
  const at = (id: StoryRouteId) => () => (params.route === id ? <Story /> : <Outlet />)

  const root = createRootRouteWithContext<AppRouterContext>()({
    beforeLoad: () => ({ viewer: FAKE_VIEWER }),
    component: Outlet,
  })
  const schedule = createRoute({
    getParentRoute: () => root,
    path: 'schedule',
    validateSearch: scheduleSearchSchema,
    component: at('/schedule'),
  })
  const scheduleNew = createRoute({
    getParentRoute: () => schedule,
    path: 'new',
    validateSearch: scheduleCreateSearchSchema,
    component: at('/schedule/new'),
  })
  const scheduleDetail = createRoute({
    getParentRoute: () => schedule,
    path: '$scheduleId/',
    component: at('/schedule/$scheduleId/'),
  })
  const scheduleEdit = createRoute({
    getParentRoute: () => schedule,
    path: '$scheduleId/edit',
    component: at('/schedule/$scheduleId/edit'),
  })
  const receipt = createRoute({
    getParentRoute: () => root,
    path: 'receipt/',
    component: at('/receipt/'),
  })
  const receiptResult = createRoute({
    getParentRoute: () => root,
    path: 'receipt/result',
    component: at('/receipt/result'),
  })

  const router = createRouter({
    routeTree: root.addChildren([
      schedule.addChildren([scheduleNew, scheduleDetail, scheduleEdit]),
      receipt,
      receiptResult,
    ]),
    history: createMemoryHistory({ initialEntries: [params.url] }),
    context,
  })
  return { router, queryClient }
}

/**
 * Container の story を、アプリと同じ ID の route と、偽物の API を持つ router の中で描く decorator。
 * story の parameters.appRouter で、置く route と最初の URL と API を指す。
 */
export const withAppRouter: Decorator = (Story, { parameters }) => {
  const params = parameters.appRouter as AppRouterParameters
  const [{ router, queryClient }] = useState(() => buildRouter(Story, params))
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

/** 一覧と 1 件の取得を、空の結果にした偽物の API を作る。 */
export const emptyBuddyApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  schedules: { ...base.schedules, list: async () => [] },
  staff: { ...base.staff, list: async () => [] },
  teams: { ...base.teams, list: async () => [] },
  patients: { ...base.patients, list: async () => [] },
})

/** 全ての操作が status の ApiError で失敗する偽物の API を作る。 */
export const failingBuddyApi = (status = 500): BuddyApi => {
  const fail = async () => {
    throw new ApiError(status, 'API が失敗した')
  }
  return {
    schedules: { list: fail, get: fail, create: fail, update: fail },
    staff: { list: fail },
    teams: { list: fail },
    patients: { list: fail },
  }
}

/** 全ての操作が終わらない偽物の API を作る。読み込み中の表示を見るために使う。 */
export const pendingBuddyApi = (): BuddyApi => {
  const wait = () => new Promise<never>(() => {})
  return {
    schedules: { list: wait, get: wait, create: wait, update: wait },
    staff: { list: wait },
    teams: { list: wait },
    patients: { list: wait },
  }
}
