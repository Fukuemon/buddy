import { Button, type ButtonVariant } from '@buddy/ui'
import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'

import { BusyLabel } from './BusyLabel'
import { SiteDialog } from './SiteDialog'

export type InputDialogProps = {
  /** testid の接頭辞。`<接頭辞>-dialog`、`-close`、`-cancel`、`-submit` を付ける。 */
  testIdPrefix: string
  /** 主ボタンの testid。省くと `<接頭辞>-submit` にする。 */
  submitTestId?: string
  title: string
  /** タイトルの右に置く要素。? のヘルプを置く。 */
  titleAddon?: ReactNode
  /** 送る前と、送っている間の主ボタンの文字。 */
  submitLabel: string
  busyLabel: string
  submitVariant?: ButtonVariant
  /** false の間は、主ボタンを押せない。 */
  canSubmit: boolean
  isSubmitting: boolean
  /** 送れなかったときの文。フッターのボタンの左に出す。isBlock なら、ボタンの上に幅いっぱいで出す。 */
  error?: { message: ReactNode; testId: string; isBlock?: boolean }
  /** children を form にしたときの form の id。主ボタンをその form の送信のボタンにする。 */
  formId?: string
  onSubmit?: () => void
  onClose: () => void
  children: ReactNode
}

/**
 * 入力のダイアログ。ヘッダーの左にタイトル、右上に閉じるボタン（×）を置き、フッターの右に「キャンセル」と主ボタンを置く。
 * ×、「キャンセル」、覆い、Escape キーは、何も変えずに閉じる。送っている間は閉じない。
 */
export const InputDialog = ({
  testIdPrefix,
  submitTestId,
  title,
  titleAddon,
  submitLabel,
  busyLabel,
  submitVariant = 'primary',
  canSubmit,
  isSubmitting,
  error,
  formId,
  onSubmit,
  onClose,
  children,
}: InputDialogProps) => {
  const titleId = useId()
  const close = () => {
    if (!isSubmitting) onClose()
  }
  return (
    <SiteDialog
      canClose={!isSubmitting}
      data-testid={`${testIdPrefix}-dialog`}
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="relative flex min-h-11 items-center gap-1">
          <h2 className="text-heading-sm" id={titleId}>
            {title}
          </h2>
          {titleAddon}
        </div>
        <button
          aria-disabled={isSubmitting || undefined}
          aria-label="閉じる"
          className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:text-text-disabled"
          data-testid={`${testIdPrefix}-close`}
          onClick={close}
          type="button"
        >
          <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
            <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      {children}
      <DialogFooter
        busyLabel={busyLabel}
        canSubmit={canSubmit}
        error={error}
        formId={formId}
        isSubmitting={isSubmitting}
        onCancel={close}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
        submitTestId={submitTestId}
        submitVariant={submitVariant}
        testIdPrefix={testIdPrefix}
      />
    </SiteDialog>
  )
}

/** 入力と確認のダイアログのフッター。理由の文、「キャンセル」、主ボタンを並べる。 */
export const DialogFooter = ({
  testIdPrefix,
  submitTestId = `${testIdPrefix}-submit`,
  submitLabel,
  busyLabel,
  submitVariant,
  canSubmit,
  isSubmitting,
  error,
  formId,
  onSubmit,
  onCancel,
}: Pick<
  InputDialogProps,
  | 'testIdPrefix'
  | 'submitTestId'
  | 'submitLabel'
  | 'busyLabel'
  | 'submitVariant'
  | 'canSubmit'
  | 'isSubmitting'
  | 'error'
  | 'formId'
  | 'onSubmit'
> & { onCancel: () => void }) => (
  <div className="flex flex-wrap items-center justify-end gap-3">
    {error !== undefined && (
      <p
        className={clsx(
          'border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger',
          error.isBlock ? 'basis-full' : 'mr-auto',
        )}
        data-testid={error.testId}
        role="alert"
      >
        {error.message}
      </p>
    )}
    <Button
      data-testid={`${testIdPrefix}-cancel`}
      disabled={isSubmitting}
      onClick={onCancel}
      size="S"
      variant="secondary"
    >
      キャンセル
    </Button>
    <Button
      data-testid={submitTestId}
      disabled={!canSubmit || isSubmitting}
      form={formId}
      onClick={formId === undefined ? onSubmit : undefined}
      size="S"
      type={formId === undefined ? 'button' : 'submit'}
      variant={submitVariant}
    >
      <BusyLabel busy={isSubmitting}>{isSubmitting ? busyLabel : submitLabel}</BusyLabel>
    </Button>
  </div>
)
