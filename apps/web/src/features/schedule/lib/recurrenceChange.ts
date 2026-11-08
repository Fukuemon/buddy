import type { Schedule } from '#/api/types'

import { toTokyoDateKey } from './dateTime'

/** 予定の詳細の「編集」を、「この予定を編集」と「繰り返しを変更」のメニューにするか。繰り返しの予定の回と、1 回を置き換えた予定で true である。 */
export const isRecurringSchedule = (schedule: Schedule) =>
  schedule.recurrence !== undefined || schedule.replacedOccurrence === true

/**
 * 予定から繰り返しを変えられない理由を返す。変えられるときは undefined を返す。today は Asia/Tokyo の今日の YYYY-MM-DD である。
 * 1 回を置き換えた予定と、今日より前の回からは変えられない。予定の API が今日より前の適用の日を拒み、置き換えた回から始める変更は ADR-0037 に無いためである。
 */
export const recurrenceChangeBlockedReason = (
  schedule: Schedule,
  today: string,
): string | undefined => {
  if (schedule.replacedOccurrence === true || schedule.recurrence === undefined) {
    return 'この回は 1 回だけ変えた予定のため、繰り返しを変えられません。ほかの回を開いて変えてください。'
  }
  if (toTokyoDateKey(new Date(schedule.startsAt)) < today) {
    return '今日より前の回からは、繰り返しを変えられません。今日以降の回を開いて変えてください。'
  }
  return undefined
}
