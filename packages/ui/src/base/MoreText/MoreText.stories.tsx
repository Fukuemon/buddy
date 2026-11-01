import type { Meta, StoryObj } from '@storybook/react-vite'

import { MoreText } from './MoreText'

const meta = {
  title: 'コンポーネント/Base/MoreText',
  component: MoreText,
  args: {
    summary: 'Google カレンダーの予定を、職員ごとに buddy へ取り込みます。',
    toggleTestId: 'import-more',
    bodyTestId: 'import-more-body',
    children: <p>取り込んだ後に Google カレンダーで変えた予定は、確認が必要な予定に出ます。</p>,
  },
} satisfies Meta<typeof MoreText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 手順のように、読みながら操作する説明は、開いた状態で始める。 */
export const DefaultOpen: Story = {
  args: {
    defaultOpen: true,
    children: (
      <ol className="list-decimal pl-6">
        <li>職員の Google カレンダーを、buddy の共有のアカウントに共有します。</li>
        <li>職員の一覧で、職員の行の「結び付ける」を押します。</li>
        <li>「取り込む」を押し、取り込む予定を確認します。</li>
      </ol>
    ),
  },
}
