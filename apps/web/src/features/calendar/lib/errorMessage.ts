import { ApiError } from '#/api/BuddyApi'
import { FORBIDDEN_MESSAGE } from '#/api/forbiddenMessage'

/** 事業所の Google カレンダーの設定（サービスアカウント）が無いときの文。 */
export const NOT_CONFIGURED_MESSAGE =
  'この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。'

/** カレンダーの連携の、職員とカレンダーを読めなかったときの文。 */
export const LINK_LOAD_ERROR_MESSAGE =
  '職員とカレンダーを読み込めませんでした。時間をおいて、読み直してください。'

/** 予定の取り込みの、結び付けたカレンダーと職員を読めなかったときの文。 */
export const IMPORT_LOAD_ERROR_MESSAGE =
  '結び付けたカレンダーを読み込めませんでした。時間をおいて、読み直してください。'

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : undefined)
const statusOf = (error: unknown) => (error instanceof ApiError ? error.status : undefined)

/** 一覧を読めなかったときの文。権限を外されたときだけ文を変える。 */
export const loadErrorMessage = (error: unknown, fallback: string) =>
  statusOf(error) === 403 ? FORBIDDEN_MESSAGE : fallback

/** カレンダーを読めるかの確認か、結び付けの失敗を、確認の結果の文にする。 */
export const linkErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'calendar_unreadable':
      return 'このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているかと、カレンダーの ID が合っているかを確認してください。'
    case 'calendar_taken':
      return 'このカレンダーは、ほかの職員に結び付いています。'
    case 'staff_has_calendar':
      return 'この職員には、ほかのカレンダーが結び付いています。一覧を読み直してください。'
    case 'calendar_already_linked':
      return 'このカレンダーは、この職員にすでに結び付いています。一覧を読み直してください。'
    case 'calendar_unavailable':
      return 'Google カレンダーに届きませんでした。時間をおいて、もう一度確認してください。'
    default:
      return '確認できませんでした。時間をおいて、もう一度確認してください。'
  }
}

/** カレンダーを外せなかったときの文。 */
export const unlinkErrorMessage = (error: unknown) =>
  statusOf(error) === 403
    ? FORBIDDEN_MESSAGE
    : '外せませんでした。時間をおいて、もう一度外してください。'

/** プレビューの失敗を、失敗の文にする。カレンダーを読めないときは、職員の名前を入れる。 */
export const previewErrorMessage = (error: unknown, staffName: string) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'calendar_unavailable':
      return 'Google カレンダーから予定を読めませんでした。時間をおいて、もう一度プレビューしてください。'
    case 'calendar_unreadable':
      return `${staffName} の Google カレンダーを読めません。カレンダーの共有が外れていないかを、職員に確認してください。`
    case 'calendar_not_configured':
      return NOT_CONFIGURED_MESSAGE
    case 'not_found':
      return 'この職員のカレンダーの結び付けが外れています。画面を読み直してください。'
    default:
      return 'プレビューできませんでした。時間をおいて、もう一度プレビューしてください。'
  }
}

/** 確認が必要な予定の、書き出しの一覧を読めなかったときの文。 */
export const REVIEW_LOAD_ERROR_MESSAGE =
  '確認が必要な予定を読み込めませんでした。時間をおいて、読み直してください。'

/** buddy の内容で書き直せなかったときの文。ほかの画面で書き直したときは、一覧を読み直させる。 */
export const rewriteErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'export_not_in_review':
    case 'not_found':
      return 'この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。'
    default:
      return '書き直せませんでした。時間をおいて、もう一度書き直してください。'
  }
}

/** 確認が必要な予定の利用者を選ぶための、利用者の一覧を読めなかったときの文。 */
export const PATIENTS_ERROR_MESSAGE =
  '利用者の一覧を読み込めませんでした。時間をおいて、もう一度プレビューしてください。'

/** 取り込みの失敗を、失敗の文にする。どの失敗でも、予定は 1 件も書いていない。 */
export const importErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'import_preview_changed':
      return 'プレビューの後に、Google カレンダーの予定か職員の休職が変わりました。もう一度プレビューしてから取り込んでください。予定は 1 件も取り込んでいません。'
    case 'import_running':
      return 'この職員の取り込みが、ほかの画面で進んでいます。終わってから、もう一度プレビューしてください。予定は 1 件も取り込んでいません。'
    case 'google_primary':
      return 'この事業所の予定は Google カレンダーで管理しているので、buddy に取り込めません。予定は 1 件も取り込んでいません。'
    case 'cutover_not_open':
      return '予定の正本の切り替えが、ほかの画面で完了したか、やめました。画面を読み直してください。予定は 1 件も取り込んでいません。'
    // 画面は期間と取り込み方の値を確認してから送るので、残る入力のエラーは、選んだ利用者がいないことである
    case 'invalid_input':
      return '選んだ利用者が見つかりません。利用者を選び直してください。予定は 1 件も取り込んでいません。'
    case 'not_found':
      return 'この職員のカレンダーの結び付けが外れています。画面を読み直してください。予定は 1 件も取り込んでいません。'
    default:
      return '取り込めませんでした。時間をおいて、もう一度取り込んでください。予定は 1 件も取り込んでいません。'
  }
}

/** 予定の正本の切り替えの状況を読めなかったときの文。 */
export const CUTOVER_LOAD_ERROR_MESSAGE =
  '予定の正本の切り替えの状況を読み込めませんでした。時間をおいて、読み直してください。'

/**
 * 切り替えの操作（始める、完了する、やめる）の失敗を、失敗の文にする。
 * 最後の同期が成功していないカレンダーがあるときは、API の文（職員の名前を含む）をそのまま出す。
 */
export const cutoverErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'cutover_open':
      return 'この事業所では、ほかの画面で切り替えを始めています。画面を読み直してください。'
    case 'cutover_not_google_primary':
      return 'この事業所の予定の正本は、すでに buddy です。画面を読み直してください。'
    case 'cutover_sync_not_ready':
      return error instanceof Error
        ? error.message
        : '最後の同期が成功していないカレンダーがあります。'
    case 'cutover_not_open':
      return 'この切り替えは、ほかの画面で完了したか、やめています。画面を読み直してください。'
    case 'calendar_unavailable':
      return 'Google カレンダーから予定を読めませんでした。時間をおいて、もう一度完了してください。'
    case 'calendar_unreadable':
      return 'Google カレンダーを読めない職員がいます。カレンダーの共有が外れていないかを、職員に確認してください。'
    case 'calendar_not_configured':
      return NOT_CONFIGURED_MESSAGE
    default:
      return '操作できませんでした。時間をおいて、もう一度試してください。'
  }
}
