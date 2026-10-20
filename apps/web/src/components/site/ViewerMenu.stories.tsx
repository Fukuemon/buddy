import type { Meta, StoryObj } from '@storybook/react-vite'

import { ViewerMenu } from './ViewerMenu'

const meta = {
  title: '画面/Common/ViewerMenu',
  component: ViewerMenu,
  args: { staffName: '青木 陽菜', canLogout: true },
} satisfies Meta<typeof ViewerMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutLogout: Story = { args: { canLogout: false } }
