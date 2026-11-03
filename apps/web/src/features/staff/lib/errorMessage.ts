import { ApiError } from '#/api/BuddyApi'
import { FORBIDDEN_MESSAGE } from '#/api/forbiddenMessage'

/** 職員の一覧を読めなかったときの文。 */
export const LIST_LOAD_ERROR_MESSAGE =
  '職員を読み込めませんでした。時間をおいて、読み直してください。'

/** 職員の詳細を読めなかったときの文。 */
export const DETAIL_LOAD_ERROR_MESSAGE = LIST_LOAD_ERROR_MESSAGE

/** 職員の詳細の職員が見つからなかったときの文。 */
export const DETAIL_NOT_FOUND_MESSAGE = '職員が見つかりません。職員の一覧から開き直してください。'

/** 部署、チーム、役職の選択肢を読めなかったときの文。 */
export const OPTIONS_LOAD_ERROR_MESSAGE =
  '部署、チーム、役職を読み込めませんでした。閉じてから、開き直してください。'

/**
 * 職員の登録と、基本の情報の保存を拒まれたときの文。verb は「登録」か「保存」で、届かなかったときの文に入る。
 * 409 は、登録では同じメールアドレスの職員がいるとき、保存では退職した職員のときである。
 */
export const staffSubmitErrorMessage = (error: unknown, verb: '登録' | '保存') => {
  if (error instanceof ApiError) {
    if (error.status === 403) return FORBIDDEN_MESSAGE
    if (error.status === 409)
      return verb === '登録'
        ? 'このメールアドレスの職員は、すでに登録されています。'
        : '退職した職員は変えられません。'
    if (error.status === 400)
      return '部署、チーム、役職のどれかが見つかりません。開き直してから、選び直してください。'
  }
  return `${verb}できませんでした。時間をおいて、もう一度${verb}してください。`
}

/** 拒まれた理由の文。403 は権限を外されたとき、409 は conflict の文である。ほかは届かなかったときの文にする。 */
const operationErrorMessage = (error: unknown, conflict: string, fallback: string) => {
  if (error instanceof ApiError && error.status === 403) return FORBIDDEN_MESSAGE
  if (error instanceof ApiError && error.status === 409) return conflict
  return fallback
}

/** 役職を変えられなかったときの文。 */
export const positionErrorMessage = (error: unknown) =>
  operationErrorMessage(
    error,
    '職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。',
    '役職を変えられませんでした。時間をおいて、もう一度変えてください。',
  )

/** 権限の保存で、1 つの変更を変えられなかった理由。 */
export const policyChangeErrorReason = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 403) return FORBIDDEN_MESSAGE
    if (error.status === 409)
      return '職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。'
    if (error.status === 400) return '対象の職員かチームが見つかりません。選び直してください。'
  }
  return '時間をおいて、もう一度保存してください。'
}

/** 権限の保存で、一部の変更を変えられなかったときの文の前置き。 */
export const POLICY_PARTIAL_ERROR_LEAD =
  '次の権限を変えられませんでした。ほかの変更は保存しました。'

/** 権限の保存で、予定の API に届かず、何も変えられなかったときの文。 */
export const POLICY_SAVE_ERROR_MESSAGE =
  '権限を変えられませんでした。時間をおいて、もう一度保存してください。'

/** 休職にできなかったときの文。 */
export const leaveErrorMessage = (error: unknown) =>
  operationErrorMessage(
    error,
    '自分と、職員の管理の権限を持つ最後の有効な職員は、休職にできません。',
    '休職にできませんでした。時間をおいて、もう一度休職にしてください。',
  )

/** 復職にできなかったときの文。 */
export const reinstateErrorMessage = (error: unknown) =>
  operationErrorMessage(
    error,
    '退職した職員は変えられません。',
    '復職にできませんでした。時間をおいて、もう一度復職にしてください。',
  )

/** 退職にできなかったときの文。予定か担当の利用者が残るときは、文ではなく残るものを出す。 */
export const retireErrorMessage = (error: unknown) =>
  operationErrorMessage(
    error,
    '自分と、職員の管理の権限を持つ最後の有効な職員は、退職にできません。',
    '退職にできませんでした。時間をおいて、もう一度退職にしてください。',
  )

/** 残る予定と担当の利用者を読めなかったときの文。 */
export const ASSIGNMENTS_LOAD_ERROR_MESSAGE =
  '残る予定と担当の利用者を読み込めませんでした。閉じてから、開き直してください。'
