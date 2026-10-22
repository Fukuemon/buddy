import { ApiError } from '#/api/client'

const RETRY = '照合できませんでした。時間をおいて、もう一度照合してください。'

/** 選んだファイルが上限を超えたときの文。 */
export const TOO_LARGE_MESSAGE = 'ファイルが大きすぎます。10 MB までのファイルにしてください。'

/** 照合の失敗を、職員が次にすることの分かる文にする。ApiError でない失敗は、やり直しを促す文にする。 */
export const checkErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return RETRY
  switch (error.status) {
    case 400:
      return '入力を読めませんでした。ファイルを選び直して、もう一度照合してください。'
    case 403:
      return 'アカウントに事業所が結び付いていないので、Google カレンダーから予定を取れません。予定の CSV で照合してください。'
    case 413:
      return TOO_LARGE_MESSAGE
    case 422:
      // 行ごとのエラーは一覧で出す。列が無いような、ファイル全体のエラーは API の文で伝える
      return error.rowErrors.length > 0
        ? '入力の CSV に誤りがあります。次の行を直して、もう一度照合してください。'
        : `入力の CSV に誤りがあります。${error.message}`
    case 502:
      return 'Google カレンダーから予定を取れませんでした。時間をおいて、もう一度照合してください。'
    case 503:
      return '事業所の Google カレンダーの設定がありません。予定の CSV で照合してください。'
    default:
      return RETRY
  }
}
