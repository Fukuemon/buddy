import { ConfirmDialog } from '@buddy/ui'

export type CalendarAcceptDialogProps = {
  /** Google カレンダーの内容に合わせる予定の日時と職員。 */
  target: string
  isSubmitting: boolean
  /** Google カレンダーの内容に合わせられなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/**
 * buddy の予定を Google カレンダーの内容に合わせる前に、buddy での変更が消えることを示して確認するダイアログ。
 * buddy での変更が消えるので、確定のボタンを赤にする。
 */
export const CalendarAcceptDialog = ({
  target,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarAcceptDialogProps) => (
  <ConfirmDialog
    busyLabel="合わせる"
    canSubmit
    error={
      errorMessage === undefined
        ? undefined
        : { message: errorMessage, testId: 'calendar-accept-error', isBlock: true }
    }
    isSubmitting={isSubmitting}
    onCancel={onCancel}
    onSubmit={onSubmit}
    submitLabel="合わせる"
    submitVariant="danger"
    testIdPrefix="calendar-accept"
    title="Google カレンダーの内容に合わせますか"
  >
    <p className="text-body" data-testid="calendar-accept-target">
      {target}
    </p>
    <p className="text-body">
      buddy の予定のタイトルと日時を、Google カレンダーの今の内容にします。buddy
      で変えたタイトルと日時は消えます。Google カレンダーで消された予定は、buddy
      でもキャンセルします。
    </p>
  </ConfirmDialog>
)
