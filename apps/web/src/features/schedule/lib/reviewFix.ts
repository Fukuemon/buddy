import type { Schedule, ScheduleReviewReason } from '#/api/types'

/** タイトルから訪問の情報を読み取れず、通常の予定として返る確認が必要な理由。 */
const VISIT_INFO_MISSING: readonly ScheduleReviewReason[] = [
  'patient_not_found',
  'patient_ambiguous',
  'service_code_not_found',
  'title_unreadable',
]

/**
 * 予定の編集で、予定の種類を訪問にして訪問の情報を足せる予定かを返す。
 * タイトルから訪問の情報を読み取れなかった Google カレンダーの予定だけが当たる。
 * title_mismatch は既に訪問の情報を持ち、recurrence_unsupported は buddy から変えられないので当たらない。
 */
export const canAddVisitInfo = (schedule: Schedule) =>
  schedule.fromGoogleCalendar === true &&
  schedule.reviewReason !== undefined &&
  VISIT_INFO_MISSING.includes(schedule.reviewReason)

/**
 * 確認が必要な Google カレンダーの予定の、直し方の文を返す。
 * title_mismatch は、buddy の訪問の情報が正本なので、buddy で保存し直すと Google カレンダーのタイトルがそろう（ADR-0029）。
 * recurrence_unsupported は、buddy から繰り返しの規則を変えられないので、Google カレンダーで直す。
 * ほかの理由は、タイトルから訪問の情報を読み取れなかった予定なので、buddy の編集で訪問の情報を入れるか、Google カレンダーでタイトルを直す。
 */
export const reviewFixMessage = (reason: ScheduleReviewReason) => {
  if (reason === 'title_mismatch')
    return 'buddy で保存し直すと、Google カレンダーのタイトルを buddy の訪問の情報に合わせて書き直します。'
  if (reason === 'recurrence_unsupported')
    return 'Google カレンダーで繰り返しの規則を直してください。'
  return 'buddy で編集して訪問の情報を入れるか、Google カレンダーでタイトルを直してください。'
}
