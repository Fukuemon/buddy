import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  stripSearchParams,
  useParams,
} from '@tanstack/react-router'
import type { Decorator, StoryContext } from '@storybook/react-vite'
import { useState } from 'react'

import { ApiError, type BuddyApi, type ReceiptApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { createFakeReceiptApi } from '#/api/fake/fakeReceiptApi'
import type { Viewer } from '#/api/types'
import { calendarImportSearchSchema } from '#/features/calendar/schema/calendarImportSearch'
import {
  scheduleCreateSearchDefaults,
  scheduleCreateSearchSchema,
} from '#/features/schedule/schema/scheduleCreateSearch'
import {
  scheduleSearchDefaults,
  scheduleSearchSchema,
} from '#/features/schedule/schema/scheduleSearch'
import type { AppRouterContext } from '#/appContext'

/** story を置く route。アプリの route の ID と同じにし、Container の useSearch と useNavigate が働くようにする。 */
export type StoryRouteId =
  | '/schedule'
  | '/schedule/new'
  | '/schedule/$scheduleId/'
  | '/schedule/$scheduleId/edit'
  | '/receipt/'
  | '/receipt/result'
  | '/schedule_/link'
  | '/schedule_/link_/cutover'
  | '/schedule_/import'
  | '/schedule_/review'
  | '/staff'
  | '/staff/new'
  | '/staff_/$staffId'
  | '/organization'
  | '/me'
  | '/patients'
  | '/patients/new'
  | '/patients_/$patientId'

/** story の parameters の appRouter に渡す値。 */
export type AppRouterParameters = {
  /** story を置く route。 */
  route: StoryRouteId
  /** 最初に開く URL。search params もここに書く。 */
  url: string
  /** ログインした職員。デフォルトはフェイクの API の職員（職員の管理の権限を持つ）。 */
  viewer?: Viewer
  /** フェイクの API。デフォルトは createFakeBuddyApi の初期の状態。 */
  api?: BuddyApi
  receiptApi?: ReceiptApi
  /** 描く前に query の cache に置く値。 */
  seed?: (queryClient: QueryClient) => void
}

/** decorator が受ける story。route の params を args に足して描けるよう、args を受ける形にする。 */
type StoryFn = (update?: { args?: Record<string, unknown> }) => React.ReactNode

const createStoryRouter = (Story: StoryFn, params: AppRouterParameters) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  params.seed?.(queryClient)
  const context: AppRouterContext = {
    queryClient,
    api: params.api ?? createFakeBuddyApi(),
    receiptApi: params.receiptApi ?? createFakeReceiptApi(),
    mode: 'fake',
    getViewer: async () => params.viewer ?? FAKE_VIEWER,
  }
  // story を置く route の外では何も描かない。story の操作で別の route へ移ると、画面は空になる
  const at = (id: StoryRouteId) => () => (params.route === id ? Story() : <Outlet />)
  // アプリの route は params の scheduleId を Container の props に渡すので、story の args にも同じ値を渡す
  const atScheduleId = (id: StoryRouteId) =>
    function ScheduleIdRoute() {
      const { scheduleId } = useParams({ strict: false })
      return params.route === id ? Story({ args: { scheduleId } }) : <Outlet />
    }

  const root = createRootRouteWithContext<AppRouterContext>()({
    beforeLoad: () => ({ viewer: params.viewer ?? FAKE_VIEWER }),
    component: Outlet,
  })
  const schedule = createRoute({
    getParentRoute: () => root,
    path: 'schedule',
    validateSearch: scheduleSearchSchema,
    search: { middlewares: [stripSearchParams(scheduleSearchDefaults)] },
    component: at('/schedule'),
  })
  const scheduleNew = createRoute({
    getParentRoute: () => schedule,
    path: 'new',
    validateSearch: scheduleCreateSearchSchema,
    search: { middlewares: [stripSearchParams(scheduleCreateSearchDefaults)] },
    component: at('/schedule/new'),
  })
  const scheduleDetail = createRoute({
    getParentRoute: () => schedule,
    path: '$scheduleId/',
    component: atScheduleId('/schedule/$scheduleId/'),
  })
  const scheduleEdit = createRoute({
    getParentRoute: () => schedule,
    path: '$scheduleId/edit',
    component: atScheduleId('/schedule/$scheduleId/edit'),
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
  // アプリでは `/schedule` の子にしない route なので、root の子に置く
  const scheduleLink = createRoute({
    getParentRoute: () => root,
    path: 'schedule/link',
    component: at('/schedule_/link'),
  })
  const scheduleCutover = createRoute({
    getParentRoute: () => root,
    path: 'schedule/link/cutover',
    component: at('/schedule_/link_/cutover'),
  })
  const scheduleImport = createRoute({
    getParentRoute: () => root,
    path: 'schedule/import',
    validateSearch: calendarImportSearchSchema,
    component: at('/schedule_/import'),
  })
  const scheduleReview = createRoute({
    getParentRoute: () => root,
    path: 'schedule/review',
    component: at('/schedule_/review'),
  })

  const staff = createRoute({
    getParentRoute: () => root,
    path: 'staff',
    component: at('/staff'),
  })
  const staffNew = createRoute({
    getParentRoute: () => staff,
    path: 'new',
    component: at('/staff/new'),
  })

  // アプリの route は params の staffId を Container の props に渡すので、story の args にも同じ値を渡す
  function StaffIdRoute() {
    const { staffId } = useParams({ strict: false })
    return params.route === '/staff_/$staffId' ? Story({ args: { staffId } }) : <Outlet />
  }
  const staffDetail = createRoute({
    getParentRoute: () => root,
    path: 'staff/$staffId',
    component: StaffIdRoute,
  })
  const me = createRoute({ getParentRoute: () => root, path: 'me', component: at('/me') })
  const organization = createRoute({
    getParentRoute: () => root,
    path: 'organization',
    component: at('/organization'),
  })

  const patients = createRoute({
    getParentRoute: () => root,
    path: 'patients',
    component: at('/patients'),
  })
  const patientsNew = createRoute({
    getParentRoute: () => patients,
    path: 'new',
    component: at('/patients/new'),
  })
  function PatientIdRoute() {
    const { patientId } = useParams({ strict: false })
    return params.route === '/patients_/$patientId' ? Story({ args: { patientId } }) : <Outlet />
  }
  const patientDetail = createRoute({
    getParentRoute: () => root,
    path: 'patients/$patientId',
    component: PatientIdRoute,
  })

  const router = createRouter({
    routeTree: root.addChildren([
      schedule.addChildren([scheduleNew, scheduleDetail, scheduleEdit]),
      receipt,
      receiptResult,
      scheduleLink,
      scheduleCutover,
      scheduleImport,
      scheduleReview,
      staff.addChildren([staffNew]),
      staffDetail,
      organization,
      me,
      patients.addChildren([patientsNew]),
      patientDetail,
    ]),
    history: createMemoryHistory({ initialEntries: [params.url] }),
    context,
  })
  return { router, queryClient }
}

const AppRouterStory = ({ Story, params }: { Story: StoryFn; params: AppRouterParameters }) => {
  const [{ router, queryClient }] = useState(() => createStoryRouter(Story, params))
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

/**
 * Container の story を、アプリと同じ ID の route と、フェイクの API を持つ router の中で描く decorator。
 * story の parameters.appRouter で、置く route と最初の URL と API を指す。
 * Controls で args を変えると、router を作り直して描き直す。
 */
export const withAppRouter: Decorator = (Story, context: StoryContext) => (
  <AppRouterStory
    key={JSON.stringify(context.args)}
    Story={Story as StoryFn}
    params={context.parameters.appRouter as AppRouterParameters}
  />
)

/** 一覧と 1 件の取得を、空の結果にしたフェイクの API を作る。 */
export const emptyBuddyApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  schedules: {
    ...base.schedules,
    list: async (...args) => ({
      ...(await base.schedules.list(...args)),
      schedules: [],
      needsReview: [],
    }),
  },
  staff: { ...base.staff, list: async () => [] },
  teams: { ...base.teams, list: async () => [] },
  patients: { ...base.patients, list: async () => [], listRecords: async () => [] },
  calendars: { ...base.calendars, list: async () => [], exportIssues: async () => [] },
})

/** 石川 二葉（staff-2）を休職にしたフェイクの API を作る。 */
export const suspendedStaffBuddyApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  staff: {
    ...base.staff,
    list: async (...args) =>
      (await base.staff.list(...args)).map((staff) =>
        staff.id === 'staff-2' ? { ...staff, status: 'on_leave' } : staff,
      ),
  },
})

/** 全ての操作を operation にしたフェイクの API を作る。 */
const buddyApiOf = (operation: () => Promise<never>): BuddyApi => ({
  facilities: { get: operation },
  me: { get: operation, externalCalendar: operation },
  schedules: { list: operation, get: operation, create: operation, update: operation },
  staff: {
    list: operation,
    listRecords: operation,
    get: operation,
    create: operation,
    update: operation,
    changePosition: operation,
    addPolicy: operation,
    removePolicy: operation,
    remainingAssignments: operation,
    startLeave: operation,
    reinstate: operation,
    retire: operation,
  },
  teams: { list: operation, create: operation, update: operation },
  departments: { list: operation, create: operation, update: operation },
  positions: { list: operation },
  policies: { list: operation },
  patients: {
    list: operation,
    listRecords: operation,
    get: operation,
    create: operation,
    update: operation,
    remainingSchedules: operation,
    endService: operation,
    resumeService: operation,
  },
  serviceCodes: { list: operation },
  calendars: {
    serviceAccount: operation,
    list: operation,
    check: operation,
    link: operation,
    unlink: operation,
    preview: operation,
    import: operation,
    exportIssues: operation,
    retryExport: operation,
    acceptExport: operation,
    cutoverStatus: operation,
    startCutover: operation,
    completeCutover: operation,
    cancelCutover: operation,
  },
})

/** 全ての操作が status の ApiError で失敗するフェイクの API を作る。 */
export const failingBuddyApi = (status = 500): BuddyApi =>
  buddyApiOf(async () => {
    throw new ApiError(status, 'API が失敗した')
  })

/** 全ての操作が終わらないフェイクの API を作る。読み込み中の表示を見るために使う。 */
export const pendingBuddyApi = (): BuddyApi => buddyApiOf(() => new Promise<never>(() => {}))
