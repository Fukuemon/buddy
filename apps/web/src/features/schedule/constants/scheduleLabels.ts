import type { ScheduleCategory, ScheduleKind, ScheduleReviewReason } from '#/api/types'

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  normal: '通常',
  visit: '訪問',
}

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  night: '夜勤',
  emergency: '緊急',
  hospitalization: '入院',
}

/** 確認が必要な予定の理由の文。Google カレンダーの予定を buddy の予定に読み替えられなかった理由ごとに引く。 */
export const SCHEDULE_REVIEW_REASON_LABEL: Record<ScheduleReviewReason, string> = {
  recurrence_unsupported: '繰り返しの規則を buddy で表せないため、最初の回だけを表示しています',
  patient_not_found: 'タイトルの利用者が見つかりません',
  patient_ambiguous: 'タイトルの利用者が 2 人以上います',
  service_code_not_found: 'タイトルのサービス内容がサービスコードにありません',
  title_unreadable: 'タイトルを読めません',
}
