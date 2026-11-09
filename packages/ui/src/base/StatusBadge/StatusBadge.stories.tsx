import type { Meta, StoryObj } from '@storybook/react-vite'

import { Avatar, DotLabel, StatusBadge } from './StatusBadge'

const meta = {
  title: 'コンポーネント/Base/StatusBadge',
  component: StatusBadge,
  args: { children: '有効' },
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Warning: Story = { args: { tone: 'warning', children: '休職' } }

export const Muted: Story = { args: { tone: 'muted', children: '退職' } }

/** 名前の先頭の 1 文字を入れた丸。StatusBadge と同じ行に並べることが多い。 */
export const WithAvatar: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar name="青木 一郎" />
      <Avatar name="石川 花子" size="L" />
      <Avatar isMuted name="上田 次郎" />
    </div>
  ),
}

/** 名前の前に色の点を置く。チームの色の点に使う。 */
export const WithDotLabel: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <DotLabel dotClassName="bg-team-blue">訪問チーム A</DotLabel>
      <DotLabel dotClassName="bg-team-orange">訪問チーム B</DotLabel>
      <DotLabel>チームなし</DotLabel>
    </div>
  ),
}
