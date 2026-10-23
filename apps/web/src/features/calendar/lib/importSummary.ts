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
export const isChoiceComplete = (choice: ReviewChoice | undefined): choice is ReviewChoice =>
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

/** 取り込まない理由の文言。並びは、理由ごとの件数を出す順である。 */
export const SKIP_REASON_LABEL: Record<ImportSkippedItem['reason'], string> = {
  all_day: '終日の予定',
  multi_day: '日をまたぐ予定',
  unreadable_time: '時刻を読めない予定',
  zero_length: '長さの無い予定',
  unreadable_title: 'タイトルを読めない予定',
  service_not_found: 'サービス内容を引けない予定',
  staff_on_leave: '休職の職員の新しい予定',
}

const SKIP_REASON_SHORT: Record<ImportSkippedItem['reason'], string> = {
  all_day: '終日',
  multi_day: '日をまたぐ',
  unreadable_time: '時刻を読めない',
  zero_length: '長さの無い',
  unreadable_title: 'タイトルを読めない',
  service_not_found: 'サービス内容を引けない',
  staff_on_leave: '休職の職員の新しい',
}

const SKIP_REASONS = Object.keys(SKIP_REASON_LABEL) as ImportSkippedItem['reason'][]

/** 取り込まない予定を理由ごとに数え、件数のある理由だけを決まった順に返す。 */
export const countSkippedByReason = (skipped: readonly ImportSkippedItem[]) =>
  SKIP_REASONS.map((reason) => ({
    reason,
    count: skipped.filter((item) => item.reason === reason).length,
  })).filter(({ count }) => count > 0)

/** プレビューの件数の箱 1 つ。key は testid の末尾に使う。 */
export type CountBox = { key: string; label: string; count: number; note: string }

/** プレビューの結果の 5 つの件数の箱を返す。件数が 0 の箱も返す。 */
export const previewCountBoxes = ({ counts }: ImportPreview): CountBox[] => {
  const expanded =
    counts.expanded_occurrences > 0 ? `。回ごとにした ${counts.expanded_occurrences} 件を含む` : ''
  return [
    {
      key: 'import',
      label: '取り込む',
      count: counts.import,
      note:
        counts.import === 0
          ? '取り込む予定は無い'
          : `訪問 ${counts.import_visit} 件、通常 ${counts.import_normal} 件${expanded}`,
    },
    {
      key: 'recurring',
      label: '繰り返し',
      count: counts.recurring,
      note:
        counts.recurring === 0
          ? '取り込む繰り返しは無い'
          : `繰り返しのまま ${counts.recurring_as_rule} 件、回ごとにする ${counts.recurring_expanded} 件`,
    },
    {
      key: 'needs_review',
      label: '確認が必要',
      count: counts.needs_review,
      note: '利用者を選んでから取り込む',
    },
    {
      key: 'skipped',
      label: '取り込まない',
      count: counts.skipped,
      note: '理由ごとの件数は下にある',
    },
    {
      key: 'already_imported',
      label: '取り込み済み',
      count: counts.already_imported,
      note: '前の取り込みで取り込んだ予定。もう一度は取り込まない',
    },
  ]
}

const DECISION_PHRASE: Record<ImportAction, [string, string]> = {
  patient: ['は利用者を選び', 'は利用者を選んだ'],
  normal: ['は通常の予定にし', 'は通常の予定にした'],
  skip: ['は取り込まず', 'は取り込まなかった'],
}

/** 取り込んだ件数の補足の文。繰り返しの予定の数と、確認した予定の取り込み方の内訳を入れる。 */
export const importedNote = (preview: ImportPreview, decisions: readonly ImportDecision[]) => {
  const parts: string[] = []
  if (preview.counts.recurring > 0)
    parts.push(`繰り返しの予定 ${preview.counts.recurring} 件を含む`)
  const used = (['patient', 'normal', 'skip'] as const)
    .map((action) => ({ action, count: decisions.filter((d) => d.action === action).length }))
    .filter(({ count }) => count > 0)
  if (used.length > 0) {
    const phrases = used.map(
      ({ action, count }, index) =>
        `${count} 件${DECISION_PHRASE[action][index === used.length - 1 ? 1 : 0]}`,
    )
    parts.push(`確認した ${decisions.length} 件のうち ${phrases.join('、')}`)
  }
  return parts.join('。')
}

/** 取り込まなかった件数の補足の文。件数のある理由を「、」でつなぐ。 */
export const notImportedNote = (preview: ImportPreview, decisions: readonly ImportDecision[]) => {
  const reasons = countSkippedByReason(preview.skipped).map(
    ({ reason }) => SKIP_REASON_SHORT[reason],
  )
  if (decisions.some((d) => d.action === 'skip')) reasons.push('取り込まないを選んだ')
  return reasons.length === 0 ? '' : `${reasons.join('、')}予定`
}
