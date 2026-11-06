import { ApiError } from '#/api/BuddyApi'
import { FORBIDDEN_MESSAGE } from '#/api/forbiddenMessage'

/** 予定が見つからなかったときの文。 */
export const SCHEDULE_NOT_FOUND_MESSAGE = '予定が見つかりません。'

/** 予定を見る権限が無かったときの文。 */
export const SCHEDULE_READ_FORBIDDEN_MESSAGE = 'この予定を見る権限がありません。'

/** 予定か、職員と利用者を読めなかったときの文。 */
export const SCHEDULE_LOAD_ERROR_MESSAGE = '予定を取得できませんでした。'

/** 予定の作成で、職員と利用者の一覧を読めなかったときの文。 */
export const SCHEDULE_OPTIONS_LOAD_ERROR_MESSAGE =
  '職員と利用者を読み込めませんでした。閉じてから、開き直してください。'

/** 編集の権限の外の予定の編集を開いたときの文。 */
export const SCHEDULE_EDIT_FORBIDDEN_MESSAGE = 'この予定を編集する権限がありません。'

/** 予定 1 件の読み込みの失敗の文。404 と 403 は読み直しても変わらないので、ほかの失敗と文を分ける。 */
export const scheduleLoadErrorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) return SCHEDULE_NOT_FOUND_MESSAGE
  if (error instanceof ApiError && error.status === 403) return SCHEDULE_READ_FORBIDDEN_MESSAGE
  return SCHEDULE_LOAD_ERROR_MESSAGE
}

/** 事業所が Google カレンダーを予定の正本にしていて、予定を書けないときの文（409 の google_primary）。 */
export const SCHEDULE_GOOGLE_PRIMARY_MESSAGE =
  'この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。'

/** google_primary の事業所で、Google カレンダーで予定が変わっていたときの文（409 の google_event_changed）。 */
export const SCHEDULE_GOOGLE_EVENT_CHANGED_MESSAGE =
  'Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。'

/**
 * google_primary の事業所で、予定の API が Google カレンダーに書けなかったときの code ごとの文（ADR-0028）。
 * google_write_unknown は、作成とほかの操作で案内が違うので、scheduleSubmitErrorMessage が決める。
 */
const GOOGLE_WRITE_MESSAGES: Record<string, string> = {
  google_event_changed: SCHEDULE_GOOGLE_EVENT_CHANGED_MESSAGE,
  google_event_not_found: 'Google カレンダーで予定が消されたか、見つかりません。',
  google_write_pending: '前の保存の結果を確認しています。時間をおいて、予定を開き直してください。',
  google_unavailable: 'Google カレンダーに書けませんでした。時間をおいて、やり直してください。',
  google_calendar_unwritable:
    'Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、事業所の管理者に確認してください。',
  google_event_rejected: 'Google カレンダーが予定を受け付けませんでした。入力を確認してください。',
  calendar_not_linked:
    '予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、事業所の管理者に頼んでください。',
  calendar_not_configured:
    'この事業所には、Google カレンダーと連携する設定がありません。事業所の管理者に確認してください。',
  cutover_open:
    '予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。',
}

/**
 * 予定の作成、保存、キャンセルを拒まれたときの文。verb は「作成」「更新」「キャンセル」のいずれかである。
 * 400 は、入力が予定の規則に合わないときである。API は合わない項目を返さないので、項目には示さない。
 * 409 の google_primary は、正本の切り替えの前の予定の API が、Google カレンダーを予定の正本にする事業所の書き込みを拒んだときである。
 * google_primary の事業所で Google カレンダーに書けなかったときは、code ごとの文を返す（GOOGLE_WRITE_MESSAGES）。
 * 503 の google_write_unknown は、作成なら同じ予定として送り直せることを、ほかの操作なら開き直すことを案内する。
 */
export const scheduleSubmitErrorMessage = (
  error: unknown,
  verb: '作成' | '更新' | 'キャンセル',
) => {
  if (error instanceof ApiError && error.status === 403) return FORBIDDEN_MESSAGE
  if (error instanceof ApiError && error.code === 'google_primary')
    return SCHEDULE_GOOGLE_PRIMARY_MESSAGE
  if (error instanceof ApiError && error.code === 'google_write_unknown') {
    return verb === '作成'
      ? 'Google カレンダーに書けたかを確認できませんでした。もう一度「作成」を押すと、同じ予定として送り直します。'
      : 'Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。'
  }
  if (error instanceof ApiError && error.code === 'google_event_changed' && verb === 'キャンセル')
    return 'Google カレンダーで予定が変更されていました。予定を開き直して、最新の予定を確認してから、もう一度キャンセルしてください。'
  if (error instanceof ApiError && error.code !== undefined && error.code in GOOGLE_WRITE_MESSAGES)
    return GOOGLE_WRITE_MESSAGES[error.code]
  if (error instanceof ApiError && error.status === 400)
    return `入力の内容では予定を${verb}できません。内容を直してください。`
  return `予定を${verb}できませんでした。`
}

/** 予定の書き込みが、Google カレンダーで予定が変わっていたために拒まれたか（409 の google_event_changed）を返す。 */
export const isGoogleEventChanged = (error: unknown) =>
  error instanceof ApiError && error.code === 'google_event_changed'
