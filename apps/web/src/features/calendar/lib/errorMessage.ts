import { ApiError } from '#/api/client'

/** 画面を開いた後に権限を外された職員が操作したときの文。 */
export const FORBIDDEN_MESSAGE = 'この操作をする権限がありません。'

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

/** カレンダーを読めるかの確かめか、結び付けの失敗を、確かめの結果の文にする。 */
export const linkErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'calendar_unreadable':
      return 'このカレンダーを読めません。カレンダーを buddy のサービスアカウントに共有したかと、カレンダーの ID が合っているかを確かめてください。'
    case 'calendar_taken':
      return 'このカレンダーは、ほかの職員に結び付いています。'
    case 'staff_has_calendar':
      return 'この職員には、ほかのカレンダーが結び付いています。一覧を読み直してください。'
    case 'calendar_already_linked':
      return 'このカレンダーは、この職員にすでに結び付いています。一覧を読み直してください。'
    case 'calendar_unavailable':
      return 'Google カレンダーに届きませんでした。時間をおいて、もう一度確かめてください。'
    default:
      return '確かめられませんでした。時間をおいて、もう一度確かめてください。'
  }
}

/** カレンダーを外せなかったときの文。 */
export const unlinkErrorMessage = (error: unknown) =>
  statusOf(error) === 403
    ? FORBIDDEN_MESSAGE
    : '外せませんでした。時間をおいて、もう一度外してください。'

/** 下見の失敗を、失敗の文にする。カレンダーを読めないときは、職員の名前を入れる。 */
export const previewErrorMessage = (error: unknown, staffName: string) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'calendar_unavailable':
      return 'Google カレンダーから予定を読めませんでした。時間をおいて、もう一度下見してください。'
    case 'calendar_unreadable':
      return `${staffName} の Google カレンダーを読めません。カレンダーの共有が外れていないかを、職員に確かめてください。`
    case 'calendar_not_configured':
      return 'サービスアカウントが設定されていないので、予定を読めません。buddy を動かしている管理者に、Google カレンダーの設定を頼んでください。'
    case 'not_found':
      return 'この職員のカレンダーの結び付けが外れています。画面を読み直してください。'
    default:
      return '下見できませんでした。時間をおいて、もう一度下見してください。'
  }
}

/** 確かめが要る予定の、書き出しの一覧を読めなかったときの文。 */
export const REVIEW_LOAD_ERROR_MESSAGE =
  '確かめが要る予定を読み込めませんでした。時間をおいて、読み直してください。'

/** buddy の内容で書き直せなかったときの文。ほかの画面で書き直したときは、一覧を読み直させる。 */
export const rewriteErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'export_not_in_review':
    case 'not_found':
      return 'この予定は、すでに書き直す待ちにしたか、書き出し終えています。一覧を読み直してください。'
    default:
      return '書き直す待ちにできませんでした。時間をおいて、もう一度書き直してください。'
  }
}

/** 確かめが要る予定の利用者を選ぶための、利用者の一覧を読めなかったときの文。 */
export const PATIENTS_ERROR_MESSAGE =
  '利用者の一覧を読み込めませんでした。時間をおいて、もう一度下見してください。'

/** 取り込みの失敗を、失敗の文にする。どの失敗でも、予定は 1 件も書いていない。 */
export const importErrorMessage = (error: unknown) => {
  if (statusOf(error) === 403) return FORBIDDEN_MESSAGE
  switch (codeOf(error)) {
    case 'import_preview_changed':
      return '下見の後に、Google カレンダーの予定が変わりました。もう一度下見してから取り込んでください。予定は 1 件も取り込んでいません。'
    case 'import_running':
      return 'この職員の取り込みが、ほかの画面で進んでいます。終わってから、もう一度下見してください。予定は 1 件も取り込んでいません。'
    // 画面は期間と取り込み方の値を確かめてから送るので、残る入力の誤りは、選んだ利用者がいないことである
    case 'invalid_input':
      return '選んだ利用者が見つかりません。利用者を選び直してください。予定は 1 件も取り込んでいません。'
    case 'not_found':
      return 'この職員のカレンダーの結び付けが外れています。画面を読み直してください。予定は 1 件も取り込んでいません。'
    default:
      return '取り込めませんでした。時間をおいて、もう一度取り込んでください。予定は 1 件も取り込んでいません。'
  }
}
