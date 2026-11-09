import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { PatientCreateDialogContainer } from './PatientCreateDialogContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/patients/new', url: '/patients/new', ...appRouter },
})

/** サービスコードを読めないフェイクの API を作る。 */
const optionsFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    serviceCodes: {
      list: async () => {
        throw new ApiError(500, '読めない')
      },
    },
  }
}

/** 登録を送ると、選んだ担当の職員が先に休職になって拒まれるフェイクの API を作る。 */
const staffStoppedApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    patients: {
      ...base.patients,
      create: async (facilityId, input) => {
        await base.staff.startLeave(MOCK_FACILITY_ID, input.assigned_staff_id, null)
        return base.patients.create(facilityId, input)
      },
    },
  }
}

const meta = {
  title: '画面/Patient/PatientCreateDialogContainer',
  component: PatientCreateDialogContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof PatientCreateDialogContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 開いた直後。選ぶ欄は何も選ばない。 */
export const Default: Story = {}

/** 登録を押した後に、選んだ担当の職員が休職になっていて拒まれたとき。 */
export const StaffStopped: Story = { parameters: route({ api: staffStoppedApi() }) }

/** サービスと職員を読めなかったとき。選択の欄と登録を押せない。 */
export const OptionsError: Story = { parameters: route({ api: optionsFailingApi() }) }
