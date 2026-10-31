import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { StaffListContainer } from './StaffListContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/staff', url: '/staff', ...appRouter },
})

/** 石川 二葉（staff-2）を休職に、江藤 四郎（staff-4）を退職にしたフェイクの API を作る。 */
export const mixedStatusApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: {
      ...base.staff,
      listRecords: async (facilityId) =>
        (await base.staff.listRecords(facilityId)).map((staff) => {
          if (staff.id === 'staff-2')
            return {
              ...staff,
              status: 'on_leave' as const,
              leave_started_at: '2026-10-31T00:00:00Z',
              leave_return_date: '2027-04-01',
            }
          if (staff.id === 'staff-4')
            return {
              ...staff,
              status: 'retired' as const,
              email: null,
              retired_at: '2026-09-30T03:00:00Z',
            }
          return staff
        }),
    },
  }
}

const meta = {
  title: '画面/Staff/StaffListContainer',
  component: StaffListContainer,
  decorators: [withAppRouter],
  parameters: route({ api: mixedStatusApi() }),
} satisfies Meta<typeof StaffListContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 開いた直後。状態の絞り込みは「在籍」で、退職の職員を出さない。 */
export const Default: Story = {}

/** 幅 768px 未満。1 行目に名前と状態の印、2 行目に部署、チーム、役職を並べる。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 職員の管理の権限を持たない職員。API を呼ばずに、権限が無いことだけを示す。 */
export const Forbidden: Story = {
  parameters: route({
    api: failingBuddyApi(),
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
}
