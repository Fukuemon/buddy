import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { CalendarImportContainer } from './CalendarImportContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule_/import', url: '/schedule/import', ...appRouter },
})

/** カレンダーの操作の一部だけを差し替えたフェイクの API を作る。 */
const calendarsApi = (calendars: Partial<BuddyApi['calendars']>): BuddyApi => {
  const base = createFakeBuddyApi()
  return { ...base, calendars: { ...base.calendars, ...calendars } }
}

const preview = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(await canvas.findByTestId('calendar-import-preview'))
  return canvas
}

const resolveAndSubmit = async (canvasElement: HTMLElement) => {
  const canvas = await preview(canvasElement)
  await userEvent.click(await canvas.findByTestId('calendar-import-review-patient-event-ambiguous'))
  await userEvent.selectOptions(
    canvas.getByTestId('calendar-import-review-patient-select-event-ambiguous'),
    'patient-1',
  )
  await userEvent.click(canvas.getByTestId('calendar-import-review-normal-event-missing'))
  await userEvent.click(canvas.getByTestId('calendar-import-submit'))
  return canvas
}

const meta = {
  title: '画面/Calendar/CalendarImportContainer',
  component: CalendarImportContainer,
  decorators: [withAppRouter],
  parameters: route({}),
  args: { onStaffChange: fn() },
} satisfies Meta<typeof CalendarImportContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Initial: Story = {}

/** 連携の画面の取り込むから、石川 二葉を選んで開いた。 */
export const WithStaff: Story = { args: { staffId: 'staff-2' } }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

export const NoCalendar: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Previewing: Story = {
  parameters: route({ api: calendarsApi({ preview: () => new Promise(() => {}) }) }),
  play: async ({ canvasElement }) => {
    await preview(canvasElement)
  },
}

export const Previewed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await preview(canvasElement)
    await canvas.findByTestId('calendar-import-result-preview')
  },
}

export const PreviewError: Story = {
  parameters: route({
    api: calendarsApi({
      preview: async () => {
        throw new ApiError(502, 'Google カレンダーに届きません', [], 'calendar_unavailable')
      },
    }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await preview(canvasElement)
    await canvas.findByTestId('calendar-import-error')
  },
}

export const Done: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await resolveAndSubmit(canvasElement)
    await canvas.findByTestId('calendar-import-result')
  },
}

export const SubmitError: Story = {
  parameters: route({
    api: calendarsApi({
      import: async () => {
        throw new ApiError(409, 'プレビューの後に予定が変わりました', [], 'import_preview_changed')
      },
    }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await resolveAndSubmit(canvasElement)
    await canvas.findByTestId('calendar-import-error')
  },
}

/** 取り込んだ期間を、もう一度プレビューした。 */
export const AllImported: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await resolveAndSubmit(canvasElement)
    await canvas.findByTestId('calendar-import-result')
    await userEvent.click(canvas.getByTestId('calendar-import-preview'))
    await canvas.findByTestId('calendar-import-all-imported')
  },
}
