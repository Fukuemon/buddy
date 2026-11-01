import { ApiError } from '#/api/client'

/** 利用者の一覧を読めなかったときの文。 */
export const LIST_LOAD_ERROR_MESSAGE =
  '利用者を読み込めませんでした。時間をおいて、読み直してください。'

/** サービスと職員の選択肢を読めなかったときの文。 */
export const OPTIONS_LOAD_ERROR_MESSAGE =
  'サービスと職員を読み込めませんでした。閉じてから、開き直してください。'

/** 操作の途中で職員の管理の権限を外されたときの文。 */
export const FORBIDDEN_MESSAGE = 'この操作をする権限がありません。'

/** 選んだ担当の職員が、ダイアログを開いた後に休職か退職になったときの文。 */
export const STAFF_STOPPED_MESSAGE =
  '選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。'

/**
 * 利用者の登録と保存を拒まれたときの文。verb は「登録」か「保存」で、届かなかったときの文に入る。
 * 400 は、予定の API の message では理由を分けられないので、送った担当の職員を読み直した staffStopped で分ける。
 */
export const patientSubmitErrorMessage = (
  error: unknown,
  verb: '登録' | '保存',
  staffStopped: boolean,
) => {
  if (error instanceof ApiError) {
    if (error.status === 403) return FORBIDDEN_MESSAGE
    if (error.status === 400)
      return staffStopped
        ? STAFF_STOPPED_MESSAGE
        : 'サービスか担当の職員が見つかりません。開き直してから、選び直してください。'
  }
  return `${verb}できませんでした。時間をおいて、もう一度${verb}してください。`
}
