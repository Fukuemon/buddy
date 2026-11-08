import type { RecurringRule } from '#/api/types'

import {
  toRecurringRuleFormValues,
  weeklyDaysOf,
  weeklyIntervalLabel,
} from '../schema/recurringRuleForm'

/** 曜日の文言。1 が月曜、7 が日曜。 */
const ISO_WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const

const weekdayLabel = (day: number) => `${ISO_WEEKDAYS[day - 1]}曜日`

/** YYYY-MM-DD を `2027年3月31日` の形にする。 */
const formatDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return `${year}年${month}月${day}日`
}

/**
 * 繰り返しの規則を、繰り返しの変更の選択肢と同じ形の文にする（ADR-0038）。
 * 「毎週 火曜日」「隔週 月曜日、木曜日」「3 週ごと 火曜日」「毎月 9 日」「毎月 第 2 月曜日」の形で、終了日があれば「（2027年3月31日まで）」を後ろに付ける。
 * 規則が持たない曜日、日、週は、予定の API と同じく baseDate（YYYY-MM-DD）から決める。baseDate には、その規則の回の日を渡す。
 */
export const recurringRuleLabel = (rule: RecurringRule, baseDate: string) => {
  const values = toRecurringRuleFormValues(rule, baseDate)
  const repetition =
    values.frequency === 'weekly'
      ? `${weeklyIntervalLabel(values.interval)} ${weeklyDaysOf(values).map(weekdayLabel).join('、')}`
      : values.monthlyBy === 'day'
        ? `毎月 ${values.dayOfMonth} 日`
        : `毎月 第 ${values.weekOfMonth} ${weekdayLabel(values.dayOfWeek)}`
  return rule.endDate === null ? repetition : `${repetition}（${formatDateKey(rule.endDate)}まで）`
}
