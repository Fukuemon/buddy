import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { CalendarLinkContainer } from './CalendarLinkContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule_/link', url: '/schedule/link', ...appRouter },
})

const notConfiguredApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    calendars: {
      ...base.calendars,
      serviceAccount: async () => {
        throw new ApiError(
          503,
          'サービスアカウントが設定されていません',
          [],
          'calendar_not_configured',
        )
      },
    },
  }
}

const meta = {
  title: '画面/Calendar/CalendarLinkContainer',
  component: CalendarLinkContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof CalendarLinkContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

export const NotConfigured: Story = { parameters: route({ api: notConfiguredApi() }) }

/** 結び付けていない職員の行で、結び付けるを押した。 */
export const LinkDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-open-staff-3'))
  },
}

/** 職員のメールアドレスのカレンダーを、読めると確認した。 */
export const LinkReadable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-open-staff-3'))
    await userEvent.click(canvas.getByTestId('calendar-link-check'))
    await canvas.findByTestId('calendar-link-check-result')
  },
}

/** 共有されていないカレンダーを確認した。 */
export const LinkUnreadable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-open-staff-3'))
    const input = canvas.getByTestId('calendar-link-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'staff-3@other.test')
    await userEvent.click(canvas.getByTestId('calendar-link-check'))
    await canvas.findByTestId('calendar-link-check-result')
  },
}

/** 結び付けた職員の行で、行の操作のメニューの外すを押した。 */
export const UnlinkDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-menu-staff-1'))
    await userEvent.click(await canvas.findByTestId('calendar-link-remove-staff-1'))
  },
}
