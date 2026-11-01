import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError, type BuddyApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { StaffDetailContainer } from './StaffDetailContainer'

const route = (staffId: string, appRouter: Partial<AppRouterParameters> = {}) => ({
  appRouter: { route: '/staff_/$staffId', url: `/staff/${staffId}`, ...appRouter },
})

/** 残る予定と担当の利用者が無いとみなすフェイクの API を作る。 */
export const noAssignmentsApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  staff: {
    ...base.staff,
    remainingAssignments: async () => ({ schedules: [], recurring_schedules: [], patients: [] }),
    retire: async (facilityId, staffId) => ({
      retired: {
        ...(await base.staff.get(facilityId, staffId)),
        status: 'retired',
        email: null,
        phone_number: null,
        retired_at: new Date().toISOString(),
      },
    }),
  },
})

/** 江藤 四郎（staff-4）を、戻る予定の日を付けて休職にしたフェイクの API を作る。 */
export const onLeaveApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  void base.staff.startLeave('facility-demo', 'staff-4', '2027-04-01')
  return base
}

/** 江藤 四郎（staff-4）を退職にしたフェイクの API を作る。 */
export const retiredApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: {
      ...base.staff,
      get: async (facilityId, staffId) => ({
        ...(await base.staff.get(facilityId, staffId)),
        status: 'retired',
        email: null,
        phone_number: null,
        retired_at: '2026-09-30T03:00:00Z',
      }),
    },
  }
}

const meta = {
  title: '画面/Staff/StaffDetailContainer',
  component: StaffDetailContainer,
  decorators: [withAppRouter],
  args: { staffId: 'staff-2' },
  parameters: route('staff-2'),
} satisfies Meta<typeof StaffDetailContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 有効な職員のプロフィール。 */
export const Default: Story = {}

/** 幅 768px 未満。編集と「…」を見出しの下に置く。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 休職の職員。「…」のメニューに復職にすると退職にするを入れる。 */
export const OnLeave: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', { api: onLeaveApi() }),
}

/** 退職した職員。編集と「…」と、変える操作を出さない。 */
export const Retired: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', { api: retiredApi() }),
}

/** ログインした職員の自分の詳細。休職と退職ができないので「…」を出さない。 */
export const Self: Story = {
  args: { staffId: FAKE_VIEWER.staffId },
  parameters: route(FAKE_VIEWER.staffId),
}

/** 残る予定と担当の利用者が無い職員。退職にできる。 */
export const NoAssignments: Story = { parameters: route('staff-2', { api: noAssignmentsApi() }) }

export const Loading: Story = { parameters: route('staff-2', { api: pendingBuddyApi() }) }

export const NotFound: Story = {
  args: { staffId: 'missing' },
  parameters: route('missing', {
    api: {
      ...createFakeBuddyApi(),
      staff: {
        ...createFakeBuddyApi().staff,
        get: async () => {
          throw new ApiError(404, '見つかりません', [], 'not_found')
        },
      },
    },
  }),
}

/** 職員の管理の権限を持たない職員。API を呼ばずに、権限が無いことだけを示す。 */
export const Forbidden: Story = {
  parameters: route('staff-2', {
    api: failingBuddyApi(),
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
}
