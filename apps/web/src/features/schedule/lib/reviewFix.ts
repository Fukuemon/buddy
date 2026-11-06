import type { ScheduleReviewReason } from '#/api/types'

/**
 * 確認が必要な Google カレンダーの予定の、直し方の文を返す。
 * title_mismatch は、buddy の訪問の情報が正本なので、buddy で保存し直すと Google カレンダーのタイトルがそろう（ADR-0028）。
 * recurrence_unsupported は、buddy から繰り返しの規則を変えられないので、Google カレンダーで直す。
 * ほかの理由は、タイトルを読み替えられなかった予定なので、Google カレンダーでタイトルを直す。
 */
export const reviewFixMessage = (reason: ScheduleReviewReason) => {
  if (reason === 'title_mismatch')
    return 'buddy で保存し直すと、Google カレンダーのタイトルを buddy の訪問の情報に合わせて書き直します。'
  if (reason === 'recurrence_unsupported')
    return 'Google カレンダーで繰り返しの規則を直してください。'
  return 'Google カレンダーでタイトルを直してください。'
}
