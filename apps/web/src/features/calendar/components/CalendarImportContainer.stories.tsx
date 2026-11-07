import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  failOnSecondCall,
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

/** 予定の正本の切り替えを始めた、Google カレンダーを正本にする事業所のフェイクの API。 */
const cutoverApi = (): BuddyApi => {
  const api = createFakeBuddyApi({
    baseDate: new Date('2026-11-05T09:00:00+09:00'),
    sourceMode: 'google_primary',
    calendarSyncs: [],
  })
  void api.calendars.startCutover(MOCK_FACILITY_ID)
  return api
}

/** 予定の正本の切り替えの間。期間の入力の代わりに切り替えの期間を出し、規則を写せない繰り返しの予定は取り込まないだけを選べる。 */
export const Cutover: Story = {
  parameters: route({ api: cutoverApi() }),
  play: async ({ canvasElement }) => {
    const canvas = await preview(canvasElement)
    await canvas.findByTestId('calendar-import-review-event-biweekly')
  },
}

/** 結び付いたカレンダーを、2 回目だけ読めないフェイクの API を作る。 */
export const refetchFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    calendars: {
      ...base.calendars,
      list: failOnSecondCall((...args) => base.calendars.list(...args)),
    },
  }
}

/** 読み終えた後に読み直して、結び付いたカレンダーを読めない。表示を残し、見出しの下に失敗の文と読み直すを出す。 */
export const RefetchError: Story = { parameters: route({ api: refetchFailingApi() }) }
