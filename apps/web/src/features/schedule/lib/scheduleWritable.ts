import type { OpenCalendarCutover, Schedule, SourceMode } from '#/api/types'

import { toTokyoDateKey } from './dateTime'

/**
 * 予定を buddy から変更とキャンセルできるかを、予定と事業所の状態で返す。職員の権限は canEditScheduleOf で別に確認する。
 * キャンセルした予定、予定の管理を buddy に移している間（cutover が null でない）、buddy の繰り返しの規則に写せない
 * Google カレンダーの繰り返しの予定（recurrence_unsupported）は変更もキャンセルもできない。予定の API がどれも書き込みを拒むためである。
 */
export const canChangeSchedule = (schedule: Schedule, cutover: OpenCalendarCutover | null) =>
  schedule.cancel === undefined &&
  cutover === null &&
  schedule.reviewReason !== 'recurrence_unsupported'

/**
 * 誤って入れた予定を buddy から削除できるかを、予定、事業所のモード、今の時刻で返す（ADR-0040）。職員の権限は canEditScheduleOf で別に確認する。
 * 変更とキャンセルができる予定のうち、予定を buddy で管理している事業所（buddy_primary）の、開始の日が今日以降の予定だけを削除できる。
 * 今日と開始の日は、予定の API と同じく Asia/Tokyo の日付で比べる。google_primary の事業所と今日より前の予定は、予定の API が削除を拒むためである。
 */
export const canDeleteSchedule = (
  schedule: Schedule,
  sourceMode: SourceMode,
  cutover: OpenCalendarCutover | null,
  now: Date,
) =>
  sourceMode === 'buddy_primary' &&
  canChangeSchedule(schedule, cutover) &&
  toTokyoDateKey(new Date(schedule.startsAt)) >= toTokyoDateKey(now)
