import type { Meta, StoryObj } from '@storybook/react-vite'
import { createMemoryHistory } from '@tanstack/react-router'
import { userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { isoWeekdayOf } from '../schema/recurringRuleForm'
import { recurringOccurrenceApi, tokyoDateFromToday } from './storyData'
import { ScheduleRecurrenceModalContainer } from './ScheduleRecurrenceModalContainer'

/**
 * 開いた後に Google カレンダーで親の規則が変わり、開いた回が無くなったフェイクの API。
 * 規則の変更を 409（google_event_changed）で拒み、2 回目からの読み出しは 404 で拒む。
 */
const occurrenceGoneApi = (): BuddyApi => {
  const api = recurringOccurrenceApi(1)
  let reads = 0
  return {
    ...api,
    schedules: {
      ...api.schedules,
      get: async (facilityId, scheduleId) => {
        reads += 1
        if (reads > 1) throw new ApiError(404, '予定が見つかりません')
        return api.schedules.get(facilityId, scheduleId)
      },
      changeRule: async () => {
        throw new ApiError(
          409,
          'Google カレンダーで予定が変わっていました。最新の予定を確認してください',
          [],
          'google_event_changed',
        )
      },
    },
  }
}

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: {
    route: '/schedule/$scheduleId/recurrence',
    url: '/schedule/recurring-occurrence/recurrence',
    ...appRouter,
  },
})

const meta = {
  title: '画面/Schedule/ScheduleRecurrenceModalContainer',
  component: ScheduleRecurrenceModalContainer,
  decorators: [withAppRouter],
  // 描くときは、route の params の scheduleId で上書きする。開く予定は parameters.appRouter.url で選ぶ
  args: { scheduleId: '' },
  parameters: route({ api: recurringOccurrenceApi(1) }),
} satisfies Meta<typeof ScheduleRecurrenceModalContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 明日の、毎週の繰り返しの予定の回。繰り返しは「毎週 <明日の曜日>」、終了は「なし」で始める。 */
export const Weekly: Story = {
  parameters: route({
    api: recurringOccurrenceApi(1),
    history: createMemoryHistory({ initialEntries: ['/schedule/recurring-occurrence/recurrence'] }),
  }),
}

/** 繰り返しの選択で「カスタム…」を選んだ。同じモーダルの中に、繰り返す（毎週）と曜日の欄を開く。 */
export const CustomWeekly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(await canvas.findByTestId('recurring-rule-preset'), 'custom')
  },
}

/** 「カスタム…」で毎月にした。日にちか第何週の曜日を選ぶ欄を開く。 */
export const CustomMonthly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(await canvas.findByTestId('recurring-rule-preset'), 'custom')
    await userEvent.selectOptions(canvas.getByTestId('recurring-rule-frequency'), 'monthly')
  },
}

/** 今の規則が 3 つの選択肢のどれとも違う（明日の曜日と違う毎週の曜日）。「カスタム…」を開いた形で始める。 */
export const StartsCustom: Story = {
  parameters: route({
    api: recurringOccurrenceApi(1, {
      // 明日の曜日の次の曜日にし、選択肢の「毎週 <明日の曜日>」と違う規則にする
      rule: {
        frequency: 'weekly',
        dayOfWeek: isoWeekdayOf(tokyoDateFromToday(2)),
        dayOfMonth: null,
        weekOfMonth: null,
        endDate: null,
      },
    }),
  }),
}

/** 終了日を決めた繰り返し。終了は「終了日」で始め、日付の欄を押せる。 */
export const WithEndDate: Story = {
  parameters: route({
    api: recurringOccurrenceApi(1, {
      rule: {
        frequency: 'weekly',
        dayOfWeek: null,
        dayOfMonth: null,
        weekOfMonth: null,
        endDate: '2099-03-31',
      },
    }),
  }),
}

/** 何も変えずに保存した。変えることを促す。 */
export const Unchanged: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('schedule-recurrence-submit'))
  },
}

/** 昨日の回の繰り返しの変更。今日から当てることを出し、今日以降の回の繰り返しを変える。 */
export const Past: Story = { parameters: route({ api: recurringOccurrenceApi(-1) }) }

/** 1 回を置き換えた予定（単発の予定として扱う）の繰り返しの変更を URL で開いた。欄を出さずに理由を出す。 */
export const Replaced: Story = {
  parameters: route({ api: recurringOccurrenceApi(1, { replaced: true }) }),
}

/** 保存したら、Google カレンダーで親の規則が変わって開いた回が無くなっていた。開き直すことを出し、保存を押せなくする。 */
export const OccurrenceGone: Story = {
  parameters: route({ api: occurrenceGoneApi() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(await canvas.findByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(canvas.getByTestId('schedule-recurrence-submit'))
  },
}
