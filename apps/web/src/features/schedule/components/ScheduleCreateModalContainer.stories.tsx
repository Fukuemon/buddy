import type { Meta, StoryObj } from '@storybook/react-vite'

import { failingBuddyApi, withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { ScheduleCreateModalContainer } from './ScheduleCreateModalContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule/new', url: '/schedule/new', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleCreateModalContainer',
  component: ScheduleCreateModalContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof ScheduleCreateModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Normal: Story = {}

export const Visit: Story = { parameters: route({ url: '/schedule/new?kind=visit' }) }

export const FromSlot: Story = {
  parameters: route({ url: '/schedule/new?start=2026-10-21&time=13:00&staffId=staff-2' }),
}

export const ListFailed: Story = { parameters: route({ api: failingBuddyApi() }) }
