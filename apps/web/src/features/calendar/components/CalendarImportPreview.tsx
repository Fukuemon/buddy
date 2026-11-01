import { BusyLabel, Button, HelpToggle } from '@buddy/ui'

import type { ImportPreview, ImportReviewItem, Patient } from '#/api/types'

import { formatDateRange, formatSkippedDateTime } from '../lib/format'
import {
  SKIP_REASON_LABEL,
  canSubmitImport,
  countRemaining,
  isAllImported,
  previewCountBoxes,
  type ReviewChoice,
  type ReviewChoices,
} from '../lib/importSummary'
import { CalendarImportCounts } from './CalendarImportCounts'
import { CalendarImportReviewItem } from './CalendarImportReviewItem'

export type CalendarImportPreviewProps = {
  preview: ImportPreview
  /** プレビューした職員の名前。 */
  staffName: string
  choices: ReviewChoices
  onChoiceChange: (eventId: ImportReviewItem['external_event_id'], choice: ReviewChoice) => void
  /** 利用者の選択肢に出す、事業所の全ての利用者。 */
  patients: readonly Patient[]
  isSubmitting: boolean
  onSubmit: () => void
  /** 取り込みの失敗の文。 */
  errorMessage?: string
}

/**
 * プレビューの結果。件数、確認が必要な予定と取り込み方、取り込まない予定の表、確定して取り込むを縦に並べる。
 * 確認が必要な予定の全てに取り込み方を選ぶまで、確定して取り込むは押せない。
 */
export const CalendarImportPreview = ({
  preview,
  staffName,
  choices,
  onChoiceChange,
  patients,
  isSubmitting,
  onSubmit,
  errorMessage,
}: CalendarImportPreviewProps) => {
  const remaining = countRemaining(preview.needs_review, choices)
  const allImported = isAllImported(preview)
  return (
    <section
      className="flex flex-col gap-5 border-t border-border pt-5"
      data-testid="calendar-import-result-preview"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex items-center gap-1">
          <h2 className="text-heading-sm">プレビューの結果</h2>
          <HelpToggle data-testid="schedule-import-help">
            確認が必要な予定は、利用者を選んでから取り込みます。取り込み済みの予定は、前の取り込みで取り込んだもので、もう一度は取り込みません。
          </HelpToggle>
        </div>
        <span className="text-caption text-text-secondary">
          {staffName}、{formatDateRange(preview.range_start, preview.range_end)}
        </span>
      </div>
      <CalendarImportCounts
        boxTestIdPrefix="calendar-import-count-"
        boxes={previewCountBoxes(preview)}
        data-testid="calendar-import-summary"
      />
      {preview.needs_review.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label">確認が必要な予定</h3>
          <p className="text-caption text-text-secondary">
            タイトルから利用者を 1 人に決められなかった予定です。
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {preview.needs_review.map((item) => (
              <CalendarImportReviewItem
                choice={choices[item.external_event_id]}
                disabled={isSubmitting}
                item={item}
                key={item.external_event_id}
                onChoiceChange={(choice) => onChoiceChange(item.external_event_id, choice)}
                patients={patients}
              />
            ))}
          </ul>
        </section>
      )}
      {preview.skipped.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label" data-testid="calendar-import-skipped-heading">
            取り込まない予定（{preview.skipped.length} 件）
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="calendar-import-skipped">
              <thead>
                <tr className="border-b border-border">
                  <th
                    className="px-3 py-2 text-left text-body-dense font-normal text-text-secondary"
                    scope="col"
                  >
                    日時
                  </th>
                  <th
                    className="px-3 py-2 text-left text-body-dense font-normal text-text-secondary"
                    scope="col"
                  >
                    理由
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.skipped.map((item, index) => (
                  // 取り込まない予定は ID を持たず、並びはプレビューのレスポンスの順で変わらない
                  // oxlint-disable-next-line react/no-array-index-key
                  <tr className="border-b border-border" key={index}>
                    <td className="px-3 py-2 text-body-dense whitespace-nowrap">
                      {formatSkippedDateTime(item)}
                    </td>
                    <td className="px-3 py-2 text-body-dense whitespace-nowrap">
                      {SKIP_REASON_LABEL[item.reason]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="flex flex-col gap-3">
        {allImported && (
          <output
            className="block border-l-4 border-border bg-surface-subtle px-3 py-2 text-body"
            data-testid="calendar-import-all-imported"
          >
            この期間の予定は、全て取り込み済みです。Google
            カレンダーで足した予定があれば、取り込む件数に出ます。
          </output>
        )}
        {remaining > 0 && (
          <output
            className="block border-l-4 border-border bg-surface-subtle px-3 py-2 text-body"
            data-testid="calendar-import-remaining"
          >
            確認が必要な予定のうち、あと {remaining} 件の取り込み方を選んでください。
          </output>
        )}
        {errorMessage !== undefined && (
          <p className="text-body text-danger" data-testid="calendar-import-error" role="alert">
            {errorMessage}
          </p>
        )}
        <div>
          <Button
            data-testid="calendar-import-submit"
            disabled={!canSubmitImport(preview, choices) || isSubmitting}
            onClick={onSubmit}
            size="S"
          >
            <BusyLabel busy={isSubmitting}>
              {isSubmitting ? '取り込んでいます' : '確定して取り込む'}
            </BusyLabel>
          </Button>
        </div>
      </div>
    </section>
  )
}
