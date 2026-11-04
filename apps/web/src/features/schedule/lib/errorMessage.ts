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

/**
 * 予定の作成と保存を拒まれたときの文。verb は「作成」か「更新」である。
 * 400 は、入力が予定の規則に合わないときである。API は合わない項目を返さないので、項目には示さない。
 * 409 の google_primary は、Google カレンダーを予定の正本にする事業所で予定を書こうとしたときである。
 */
export const scheduleSubmitErrorMessage = (error: unknown, verb: '作成' | '更新') => {
  if (error instanceof ApiError && error.status === 403) return FORBIDDEN_MESSAGE
  if (error instanceof ApiError && error.code === 'google_primary')
    return SCHEDULE_GOOGLE_PRIMARY_MESSAGE
  if (error instanceof ApiError && error.status === 400)
    return `入力の内容では予定を${verb}できません。内容を直してください。`
  return `予定を${verb}できませんでした。`
}
