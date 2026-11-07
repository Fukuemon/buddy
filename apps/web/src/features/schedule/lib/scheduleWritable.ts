import type { OpenCalendarCutover, Schedule } from '#/api/types'

/**
 * 予定を buddy から変更とキャンセルできるかを、予定と事業所の状態で返す。職員の権限は canEditScheduleOf で別に確認する。
 * キャンセルした予定、予定の正本を切り替えている間（cutover が null でない）、buddy の繰り返しの規則に写せない
 * Google カレンダーの繰り返しの予定（recurrence_unsupported）は変更もキャンセルもできない。予定の API がどれも書き込みを拒むためである。
 */
export const canChangeSchedule = (schedule: Schedule, cutover: OpenCalendarCutover | null) =>
  schedule.cancel === undefined &&
  cutover === null &&
  schedule.reviewReason !== 'recurrence_unsupported'
