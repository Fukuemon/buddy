import { ApiError } from '#/api/client'
import type { ReceiptCsvError, ReceiptWarning } from '#/api/types'

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
      return '照合の権限がありません。権限が要るときは、職員の管理の権限を持つ職員に頼んでください。'
    case 413:
      return TOO_LARGE_MESSAGE
    case 422:
      return '入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。'
    case 502:
      return error.code === 'permission_check_failed'
        ? '照合の権限を確認できませんでした。時間をおいて、もう一度照合してください。'
        : 'Google カレンダーから予定を取れませんでした。時間をおいて、もう一度照合してください。'
    case 503:
      return 'この事業所では、まだ Google カレンダーを使う準備ができていません。予定の CSV で照合してください。'
    default:
      return RETRY
  }
}

const FILE_LABEL: Record<ReceiptCsvError['source'], string> = {
  schedules: '予定の CSV',
  visits: '実績の CSV',
}

/** ファイルの全体を直すときに、職員がすること。 */
const REDO: Record<ReceiptCsvError['source'], string> = {
  schedules: 'CSV として保存し直してください。',
  visits: '電子カルテから書き出し直してください。',
}

/** 列の値の誤りの、列の名前の後に続ける文。 */
const valueProblem = (reason: ReceiptCsvError['reason']) => {
  switch (reason) {
    case 'empty_value':
      return 'が空です。'
    case 'invalid_date':
      return 'を日付として読めません。'
    case 'invalid_time':
      return 'を時刻として読めません。'
    case 'end_before_start':
      return 'が開始時間より前です。'
    case 'invalid_duration':
      return 'が分の数になっていません。'
    default:
      return undefined
  }
}

const rowText = (e: ReceiptCsvError) => {
  const file = FILE_LABEL[e.source]
  const row = e.line === undefined ? `${file} ` : `${file} の ${e.line} 行目`
  if (e.reason === 'malformed_row') {
    return `${row}を読めません。値の中の「"」を確認してください。`
  }
  const problem = valueProblem(e.reason)
  if (e.column !== undefined && problem !== undefined) return `${row}の「${e.column}」${problem}`
  return `${row}に誤りがあります。`
}

/**
 * 照合の API が返した入力の CSV の誤りを、職員に見せる文の一覧にする。
 * 足りない列は、CSV ごとに 1 つの文にまとめる。API の message は使わない。
 */
export const csvErrorLines = (errors: readonly ReceiptCsvError[]): string[] => {
  const lines: string[] = []
  const missing = new Map<ReceiptCsvError['source'], string[]>()
  for (const e of errors) {
    const file = FILE_LABEL[e.source]
    switch (e.reason) {
      case 'encoding':
        lines.push(`${file} の文字を読めません。${REDO[e.source]}`)
        break
      case 'empty_file':
        lines.push(`${file} が空です。${REDO[e.source]}`)
        break
      case 'missing_column': {
        const columns = missing.get(e.source)
        if (columns === undefined) missing.set(e.source, [e.column ?? ''])
        else columns.push(e.column ?? '')
        break
      }
      default:
        lines.push(rowText(e))
    }
  }
  const missingLines = [...missing].map(([source, columns]) => {
    const names = columns.map((c) => `「${c}」`).join('')
    return `${FILE_LABEL[source]} に${names}の列がありません。${REDO[source]}`
  })
  return [...missingLines, ...lines]
}

/** 照合に使わなかった予定の理由を、職員に見せる文にする。API の message は使わない。 */
export const warningReasonText = (w: ReceiptWarning) => {
  switch (w.reason) {
    case 'unreadable_title':
      return 'タイトルが「【サービス内容】利用者名」の形になっていません。'
    case 'unreadable_time':
      return '開始か終了の日時を読めません。'
    case 'spans_days':
      return '日付をまたいでいます。'
    default: {
      const problem = valueProblem(w.reason)
      return w.column !== undefined && problem !== undefined
        ? `「${w.column}」${problem}`
        : '予定を読めません。'
    }
  }
}
