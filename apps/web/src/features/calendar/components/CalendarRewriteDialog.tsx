import { ConfirmDialog } from '@buddy/ui'

export type CalendarRewriteDialogProps = {
  /** 書き直す予定の日時と職員。 */
  target: string
  /** buddy でキャンセルした単発の予定か。書き直すと Google カレンダーの予定を消すので、注意の文を替える。 */
  isCancelled?: boolean
  isSubmitting: boolean
  /** 書き直しを始められなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/**
 * Google カレンダーの予定を buddy の内容で書き直す前に、Google カレンダーでの変更が消えることを示して確認するダイアログ。
 * Google カレンダーでの変更が消えるので、確定のボタンを赤にする。
 */
export const CalendarRewriteDialog = ({
  target,
  isCancelled = false,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarRewriteDialogProps) => (
  <ConfirmDialog
    busyLabel="書き直す"
    canSubmit
    error={
      errorMessage === undefined
        ? undefined
        : { message: errorMessage, testId: 'calendar-rewrite-error', isBlock: true }
    }
    isSubmitting={isSubmitting}
    onCancel={onCancel}
    onSubmit={onSubmit}
    submitLabel="書き直す"
    submitVariant="danger"
    testIdPrefix="calendar-rewrite"
    title="buddy の内容で書き直しますか"
  >
    <p className="text-body" data-testid="calendar-rewrite-target">
      {target}
    </p>
    <p className="text-body" data-testid="calendar-rewrite-notice">
      {isCancelled
        ? 'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。'
        : 'Google カレンダーの予定のタイトルと日時を buddy の内容にします。Google カレンダーで直したタイトルと日時は消えます。消された予定は作り直します。'}
    </p>
  </ConfirmDialog>
)
