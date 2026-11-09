import type { RecurringRule } from '#/api/types'
import { formatDateKey } from '#/components/dateFormat'

import {
  toRecurringRuleFormValues,
  weeklyDaysOf,
  type RecurringRuleFormValues,
} from '../schema/recurringRuleForm'

/** 曜日の 1 字の文言。1 が月曜、7 が日曜で、添え字は曜日から 1 を引いた数である。 */
export const ISO_WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const

/** 曜日（1 が月曜、7 が日曜）を「月曜日」の形にする。 */
export const weekdayLabel = (day: number) => `${ISO_WEEKDAYS[day - 1]}曜日`

/** 毎週の間隔を「毎週」として扱うか。1 と、欄を空にした間（NaN）である。 */
const isEveryWeek = (interval: number) => interval === 1 || Number.isNaN(interval)

/**
 * 毎週の間隔の文言。1 は「毎週」、2 は「隔週」、3 以上は「3 週ごと」の形である。
 * 欄を空にした間（NaN）は「毎週」を出す。範囲の外の数は、入れた数のまま出し、誤りの文で直させる。
 */
export const weeklyIntervalLabel = (interval: number) => {
  if (isEveryWeek(interval)) return '毎週'
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
 * 7 つの曜日の毎週は、毎日を表す形なので「毎日」にする。隔週と 3 週ごと以上は、7 つの曜日でも曜日を並べる。
 * 繰り返しの変更の選択肢と、予定の詳細と予定の作成の繰り返しの文は、この文から作る。
 */
export const repetitionLabel = (values: RepetitionValues) => {
  if (values.frequency === 'weekly') {
    const days = weeklyDaysOf(values)
    if (isEveryWeek(values.interval) && ISO_WEEKDAYS.every((_, i) => days.includes(i + 1))) {
      return '毎日'
    }
    return `${weeklyIntervalLabel(values.interval)} ${days.map(weekdayLabel).join('、')}`
  }
  if (values.monthlyBy === 'day') return `毎月 ${values.dayOfMonth} 日`
  return `毎月 第 ${values.weekOfMonth} ${weekdayLabel(values.dayOfWeek)}`
}

/**
 * 繰り返しの規則を、繰り返しの変更の選択肢と同じ形の文（repetitionLabel）にし、終了日があれば「（2027年3月31日（水）まで）」を後ろに付ける。
 * 規則が持たない曜日、日、週は、予定の API と同じく baseDate（YYYY-MM-DD）から決める。baseDate には、その規則の回の日を渡す。
 */
export const recurringRuleLabel = (rule: RecurringRule, baseDate: string) => {
  const repetition = repetitionLabel(toRecurringRuleFormValues(rule, baseDate))
  return rule.endDate === null ? repetition : `${repetition}（${formatDateKey(rule.endDate)}まで）`
}
