import { ApiError } from '#/api/client'

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

/** 作成か保存の途中で、予定の編集の権限を外されたときの文。職員の管理の画面と同じ文にする。 */
export const FORBIDDEN_MESSAGE = 'この操作をする権限がありません。'

/** 予定 1 件の読み込みの失敗の文。404 と 403 は読み直しても変わらないので、ほかの失敗と文を分ける。 */
export const scheduleLoadErrorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) return SCHEDULE_NOT_FOUND_MESSAGE
  if (error instanceof ApiError && error.status === 403) return SCHEDULE_READ_FORBIDDEN_MESSAGE
  return SCHEDULE_LOAD_ERROR_MESSAGE
}

/**
 * 予定の作成と保存を拒まれたときの文。verb は「作成」か「更新」である。
 * 400 は、入力が予定の規則に合わないときである。API は合わない項目を返さないので、項目には示さない。
 */
export const scheduleSubmitErrorMessage = (error: unknown, verb: '作成' | '更新') => {
  if (error instanceof ApiError && error.status === 403) return FORBIDDEN_MESSAGE
  if (error instanceof ApiError && error.status === 400)
    return `入力の内容では予定を${verb}できません。内容を直してください。`
  return `予定を${verb}できませんでした。`
}
