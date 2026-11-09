import type { RecurringRule } from '#/api/types'

import {
  toRecurringRuleFormValues,
  weeklyDaysOf,
  type RecurringRuleFormValues,
} from '../schema/recurringRuleForm'

/** 曜日の 1 字の文言。1 が月曜、7 が日曜で、添え字は曜日から 1 を引いた数である。 */
export const ISO_WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const

/** 曜日（1 が月曜、7 が日曜）を「月曜日」の形にする。 */
export const weekdayLabel = (day: number) => `${ISO_WEEKDAYS[day - 1]}曜日`

/**
 * 毎週の間隔の文言。1 は「毎週」、2 は「隔週」、3 以上は「3 週ごと」の形である。
 * 欄を空にした間（NaN）は「毎週」を出す。範囲の外の数は、入れた数のまま出し、誤りの文で直させる。
 */
export const weeklyIntervalLabel = (interval: number) => {
  if (interval === 1 || Number.isNaN(interval)) return '毎週'
  if (interval === 2) return '隔週'
  return `${interval} 週ごと`
}

/** 繰り返しの文を作るのに使う、繰り返しの欄の値。 */
export type RepetitionValues = Pick<
  RecurringRuleFormValues,
  'frequency' | 'weeklyDays' | 'interval' | 'monthlyBy' | 'dayOfMonth' | 'weekOfMonth' | 'dayOfWeek'
>

/**
 * 繰り返しの欄の値を、終了日を除いた繰り返しの文にする（ADR-0038）。
 * 「毎週 火曜日」「隔週 月曜日、木曜日」「3 週ごと 火曜日」「毎月 9 日」「毎月 第 2 月曜日」の形である。
 * 毎週の曜日は、重なりを除いて月曜から日曜の順に並べる。
 * 繰り返しの変更の選択肢と、予定の詳細と予定の作成の繰り返しの文は、この文から作る。
 */
export const repetitionLabel = (values: RepetitionValues) => {
  if (values.frequency === 'weekly') {
    return `${weeklyIntervalLabel(values.interval)} ${weeklyDaysOf(values).map(weekdayLabel).join('、')}`
  }
  if (values.monthlyBy === 'day') return `毎月 ${values.dayOfMonth} 日`
  return `毎月 第 ${values.weekOfMonth} ${weekdayLabel(values.dayOfWeek)}`
}

/** YYYY-MM-DD を `2027年3月31日` の形にする。 */
const formatDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return `${year}年${month}月${day}日`
}

/**
 * 繰り返しの規則を、繰り返しの変更の選択肢と同じ形の文（repetitionLabel）にし、終了日があれば「（2027年3月31日まで）」を後ろに付ける。
 * 規則が持たない曜日、日、週は、予定の API と同じく baseDate（YYYY-MM-DD）から決める。baseDate には、その規則の回の日を渡す。
 */
export const recurringRuleLabel = (rule: RecurringRule, baseDate: string) => {
  const repetition = repetitionLabel(toRecurringRuleFormValues(rule, baseDate))
  return rule.endDate === null ? repetition : `${repetition}（${formatDateKey(rule.endDate)}まで）`
}
