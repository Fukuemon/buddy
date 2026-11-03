import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_FACILITY_ID } from '#/api/fake/fixtures'
import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { PatientListContainer } from './PatientListContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/patients', url: '/patients', ...appRouter },
})

/** 石川 二葉（staff-2）を休職にし、木村 夏夫（patient-2）の担当にしたフェイクの API を作る。 */
export const onLeaveStaffApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  void base.patients.update(FAKE_FACILITY_ID, 'patient-2', {
    name: '木村 夏夫',
    preferred_time: '午後',
    preferred_gender: '男性',
    service_code_id: 'code-i3',
    assigned_staff_id: 'staff-2',
  })
  void base.staff.startLeave(FAKE_FACILITY_ID, 'staff-2', null)
  return base
}

const meta = {
  title: '画面/Patient/PatientListContainer',
  component: PatientListContainer,
  decorators: [withAppRouter],
  parameters: route({ api: onLeaveStaffApi() }),
} satisfies Meta<typeof PatientListContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 開いた直後。状態の絞り込みは「利用中」で、利用の終了の利用者を出さない。 */
export const Default: Story = {}

/** 幅 768px 未満。1 行目に名前、2 行目に担当の職員、サービス、希望を並べる。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 事業所に利用者がまだいないとき。絞り込みで 0 件と同じ表示にする。 */
export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }
