import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
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

/** 職員の管理の権限を持たない職員。API を呼ばない（全ての API が失敗しても、権限が無いことだけを示す）。 */
export const Forbidden: Story = {
  parameters: route({
    api: failingBuddyApi(),
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
}

/** 結び付けていない職員の行で、結び付けるを押した。 */
export const LinkDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-open-staff-3'))
  },
}

/** 職員のメールアドレスのカレンダーを、読めると確かめた。 */
export const LinkReadable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-open-staff-3'))
    await userEvent.click(canvas.getByTestId('calendar-link-check'))
    await canvas.findByTestId('calendar-link-check-result')
  },
}

/** 共有されていないカレンダーを確かめた。 */
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

/** 結び付けた職員の行で、外すを押した。 */
export const UnlinkDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('calendar-link-remove-staff-1'))
  },
}
