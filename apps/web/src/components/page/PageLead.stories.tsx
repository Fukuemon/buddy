import type { Meta, StoryObj } from '@storybook/react-vite'

import { PageLead } from './PageLead'

const meta = {
  title: '画面/Common/PageLead',
  component: PageLead,
  args: {
    children: '予定と、電子カルテから書き出した実績を比べ、食い違いを見つけます。',
    more: '訪問日、利用者名、主訪問者が同じ予定と実績を比べ、結果を 4 つに分けます。',
    testId: 'page-more',
  },
} satisfies Meta<typeof PageLead>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
