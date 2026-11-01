import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError, type BuddyApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { StaffCreateDialogContainer } from './StaffCreateDialogContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/staff/new', url: '/staff/new', ...appRouter },
})

/** 部署、チーム、役職を読めないフェイクの API を作る。 */
const optionsFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    departments: {
      list: async () => {
        throw new ApiError(500, '読めない')
      },
    },
  }
}

const meta = {
  title: '画面/Staff/StaffCreateDialogContainer',
  component: StaffCreateDialogContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof StaffCreateDialogContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 開いた直後。部署、チーム、役職は名前の順の最初のものを選ぶ。 */
export const Default: Story = {}

/** 部署、チーム、役職を読めなかったとき。選択の欄と登録を押せない。 */
export const OptionsError: Story = { parameters: route({ api: optionsFailingApi() }) }
