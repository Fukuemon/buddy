import type {
  ImportDecision,
  ImportPreview,
  ImportReviewItem,
  ImportSkippedItem,
} from '#/api/types'

/** 取り込み方の選択肢。patient は利用者を選ぶ、normal は通常の予定にする、skip は取り込まない。 */
export type ImportAction = ImportDecision['action']

/** 確認が必要な予定 1 件の、選んでいる途中の取り込み方。利用者は、patient を選んだときだけ持つ。 */
export type ReviewChoice = { action: ImportAction; patientId?: string }

/** 確認が必要な予定の Google の予定の ID ごとの、選んだ取り込み方。 */
export type ReviewChoices = Record<ImportReviewItem['external_event_id'], ReviewChoice>

/** 取り込み方を選び終えたかを返す。patient は利用者も選んだときに選び終えたとする。 */
const isChoiceComplete = (choice: ReviewChoice | undefined): choice is ReviewChoice =>
  choice !== undefined && (choice.action !== 'patient' || choice.patientId !== undefined)

/** 確認が必要な予定のうち、取り込み方を選び終えていない予定の数を返す。 */
export const countRemaining = (items: readonly ImportReviewItem[], choices: ReviewChoices) =>
  items.filter((item) => !isChoiceComplete(choices[item.external_event_id])).length

/** 選んだ取り込み方を、予定の API に送る形にする。プレビューのバージョンを付ける。選び終えていない予定は含めない。 */
export const toDecisions = (
  items: readonly ImportReviewItem[],
  choices: ReviewChoices,
): ImportDecision[] =>
  items.flatMap((item): ImportDecision[] => {
    const choice = choices[item.external_event_id]
    if (!isChoiceComplete(choice)) return []
    return [
      choice.action === 'patient'
        ? {
            external_event_id: item.external_event_id,
            revision: item.revision,
            action: 'patient',
            patient_id: choice.patientId,
          }
        : {
            external_event_id: item.external_event_id,
            revision: item.revision,
            action: choice.action,
          },
    ]
  })

/** 確定して取り込むを押せるかを返す。取り込む予定か確認が必要な予定があり、全てを選び終えたときに押せる。 */
export const canSubmitImport = (preview: ImportPreview, choices: ReviewChoices) =>
  (preview.counts.import > 0 || preview.needs_review.length > 0) &&
  countRemaining(preview.needs_review, choices) === 0

/**
 * プレビューの結果が、全て前の取り込みで取り込み済みかを返す。休職の職員の新しい予定があれば、取り込み済みでない予定が
 * 残るので偽にする。
 */
export const isAllImported = (preview: ImportPreview) =>
  preview.counts.import === 0 &&
  preview.needs_review.length === 0 &&
  preview.counts.already_imported > 0 &&
  !preview.skipped.some((item) => item.reason === 'staff_on_leave')

/** 取り込まない理由の文言。取り込まない予定の表の理由の列に出す。 */
export const SKIP_REASON_LABEL: Record<ImportSkippedItem['reason'], string> = {
  all_day: '終日の予定',
  multi_day: '日をまたぐ予定',
  unreadable_time: '時刻を読めない予定',
  zero_length: '長さの無い予定',
  unreadable_title: 'タイトルを読めない予定',
  service_not_found: 'サービス内容を引けない予定',
  staff_on_leave: '休職の職員の新しい予定',
}

/** 件数の箱 1 つ。key は testid の末尾に使う。note は件数の内訳で、内訳の無い箱は空にする。 */
export type CountBox = { key: string; label: string; count: number; note: string }

/** 件数が 0 の箱を除く。0 件の箱は、職員がすることも知ることも無いためである。 */
export const nonZeroBoxes = (boxes: readonly CountBox[]) => boxes.filter((box) => box.count > 0)

/**
 * プレビューの結果の件数の箱を返す。件数が 0 の箱は返さない。
 * 取り込まない予定の件数は、取り込まない予定の表の見出しに出すので、箱にしない。
 * 補足の文は、画面のほかの場所に無い内訳だけにする。確認が必要と取り込み済みの意味は、見出しの ? のヘルプに出す。
 */
export const previewCountBoxes = ({ counts }: ImportPreview): CountBox[] => {
  const expanded =
    counts.expanded_occurrences > 0
      ? `。繰り返しの予定を 1 回ずつに分けた ${counts.expanded_occurrences} 件を含む`
      : ''
  return nonZeroBoxes([
    {
      key: 'import',
      label: '取り込む',
      count: counts.import,
      note: `訪問 ${counts.import_visit} 件、通常 ${counts.import_normal} 件${expanded}`,
    },
    {
      key: 'recurring',
      label: '繰り返し',
      count: counts.recurring,
      note: `繰り返しとして ${counts.recurring_as_rule} 件、1 回ずつに分ける ${counts.recurring_expanded} 件`,
    },
    { key: 'needs_review', label: '確認が必要', count: counts.needs_review, note: '' },
    { key: 'already_imported', label: '取り込み済み', count: counts.already_imported, note: '' },
  ])
}
