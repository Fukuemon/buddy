import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'

import { SiteNav, siteNavGroups } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  args: {
    groups: siteNavGroups({ ...FAKE_VIEWER, policyCodes: ['staff.manage', 'receipt.check'] }),
    current: '/schedule/review',
    badges: {
      review: (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-caption font-bold text-text-inverse">
          3
        </span>
      ),
    },
  },
  decorators: [
    (Story, { args }) => (
      <div className={args.isRail === true ? 'w-20' : 'w-56'}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

/** 職員の管理の権限を持つ職員が、確認が必要な予定の画面を開いた状態。要確認に印と件数が付く。 */
export const Manager: Story = {}

/** 予定のカレンダーで始める、たたんだレール。見出しを出さず、機能の間を区切り線で分ける。 */
export const Rail: Story = { args: { current: '/schedule', isRail: true } }

/** 職員の管理の権限を持たず、照合の権限を持つ職員（事務）が、照合の画面を開いた状態。予定の下はカレンダーだけになる。 */
export const Staff: Story = {
  args: {
    groups: siteNavGroups({ ...FAKE_VIEWER, policyCodes: ['receipt.check'] }),
    current: '/receipt',
    badges: {},
  },
}

/** 職員の管理の権限も照合の権限も持たない職員（チームリーダーとメンバー）。照合を出さない。 */
export const Member: Story = {
  args: {
    groups: siteNavGroups({ ...FAKE_VIEWER, policyCodes: [] }),
    current: '/schedule',
    badges: {},
  },
}
