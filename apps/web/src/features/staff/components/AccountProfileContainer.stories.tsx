import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import type { StaffPolicy, Viewer } from '#/api/types'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { AccountProfileContainer } from './AccountProfileContainer'

const route = (appRouter: Partial<AppRouterParameters> = {}) => ({
  appRouter: { route: '/me', url: '/me', ...appRouter },
})

/** 職員の管理の権限を持たない職員。持つ権限は、自分の予定の編集と、指定した 2 人の職員の予定の閲覧である。 */
const memberPolicies: StaffPolicy[] = [
  {
    user_policy_id: 'up-user-read',
    policy_id: 'policy-schedule-user-read',
    code: 'schedule.user.read',
    name: '指定した職員の予定の閲覧',
    target_user_ids: ['staff-2', 'staff-3'],
    target_team_ids: [],
  },
  {
    user_policy_id: 'up-self-edit',
    policy_id: 'policy-schedule-self-edit',
    code: 'schedule.self.edit',
    name: '自分の予定の編集',
    target_user_ids: [],
    target_team_ids: [],
  },
]

const memberViewer: Viewer = {
  ...FAKE_VIEWER,
  policyCodes: memberPolicies.map((p) => p.code),
  schedulePolicies: [],
}

/** ログインした職員の権限を policies にしたフェイクの API を作る。 */
export const withPoliciesApi = (
  policies: StaffPolicy[],
  base: BuddyApi = createFakeBuddyApi(),
): BuddyApi => ({
  ...base,
  me: { ...base.me, get: async (facilityId) => ({ ...(await base.me.get(facilityId)), policies }) },
})

/** ログインした職員にカレンダーが結び付いていないフェイクの API を作る。 */
export const notLinkedApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  me: { ...base.me, externalCalendar: async () => null },
})

const meta = {
  title: '画面/Staff/AccountProfileContainer',
  component: AccountProfileContainer,
  decorators: [withAppRouter],
  parameters: route({ api: withPoliciesApi(memberPolicies), viewer: memberViewer }),
} satisfies Meta<typeof AccountProfileContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 職員の管理の権限を持たない職員の自分の情報。対象を指定した権限には対象の名前を添える。 */
export const Default: Story = {}

/** 幅 768px 未満。項目の名前と値を縦に積む。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 職員の管理の権限を持つ職員。職員の詳細を開くリンクを出す。 */
export const Manager: Story = {
  parameters: route({ api: createFakeBuddyApi(), viewer: FAKE_VIEWER }),
}

/** カレンダーが結び付いていない職員。 */
export const NotLinked: Story = {
  parameters: route({
    api: notLinkedApi(withPoliciesApi(memberPolicies)),
    viewer: memberViewer,
  }),
}

/** 権限を 1 つも持たない職員。 */
export const NoPolicies: Story = {
  parameters: route({
    api: withPoliciesApi([]),
    viewer: { ...FAKE_VIEWER, policyCodes: [], schedulePolicies: [] },
  }),
}

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }
