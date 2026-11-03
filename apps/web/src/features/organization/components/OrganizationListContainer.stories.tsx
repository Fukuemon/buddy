import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { OrganizationListContainer } from './OrganizationListContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/organization', url: '/organization', ...appRouter },
})

/** 部署もチームも無いフェイクの API を作る。 */
const emptyOrganizationApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    departments: { ...base.departments, list: async () => [] },
    teams: { ...base.teams, list: async () => [] },
  }
}

const meta = {
  title: '画面/Organization/OrganizationListContainer',
  component: OrganizationListContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof OrganizationListContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 開いた直後。部署とチームを名前の順に並べ、チームの名前の前にチームの色の点を置く。 */
export const Default: Story = {}

/** 幅 768px 未満。カラムの名前を出さず、どの行も名前と「編集」を 1 行に並べる。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 事業所に部署もチームも無い。 */
export const Empty: Story = { parameters: route({ api: emptyOrganizationApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }
