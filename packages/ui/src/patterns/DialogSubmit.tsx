import { useId, type ReactNode } from 'react'

import { BusyLabel } from '../base/Button/BusyLabel'
import { Button, type ButtonVariant } from '../base/Button/Button'

/** 入力と確認のダイアログが共に持つ、フッターのボタンと送る状態の props。 */
export type DialogSubmitProps = {
  /** testid の接頭辞。`<接頭辞>-dialog`、`-cancel`、`-submit` を付ける。 */
  testIdPrefix: string
  /** 確定のボタンの testid。省くと `<接頭辞>-submit` にする。 */
  submitTestId?: string
  /** 確定のボタンの文字と、送っている間の文字。操作の動詞にする。 */
  submitLabel: string
  busyLabel: string
  /** データを失う操作の確定は danger にする。 */
  submitVariant?: ButtonVariant
  /** false の間は、確定のボタンを押せない。 */
  canSubmit: boolean
  /**
   * canSubmit が false の間に、確定のボタンを押せるようにする条件の文。ボタンの左に出し、ボタンの説明として結び付ける。
   * 選択肢を読み込む間のように、待てば押せるようになるときは渡さない。
   */
  submitHint?: ReactNode
  /** true の間は、確定のボタンに回転の印を出し、閉じる操作を全て止める。 */
  isSubmitting: boolean
  /** 送れなかったときの文。フッターのボタンの左に出す。isBlock なら、ボタンの上に幅いっぱいで出す。 */
  error?: { message: ReactNode; testId: string; isBlock?: boolean }
}

/** フッターの「キャンセル」と確定のボタン。 */
export const SubmitButtons = ({
  testIdPrefix,
  submitTestId = `${testIdPrefix}-submit`,
  submitLabel,
  busyLabel,
  submitVariant = 'primary',
  canSubmit,
  submitHint,
  isSubmitting,
  formId,
  onSubmit,
  onCancel,
}: Omit<DialogSubmitProps, 'error'> & {
  formId?: string
  onSubmit?: () => void
  onCancel: () => void
}) => {
  const hintId = useId()
  const showsHint = !canSubmit && !isSubmitting && submitHint !== undefined
  return (
    <>
      {showsHint && (
        <p
          className="mr-auto text-caption text-text-secondary"
          data-testid={`${testIdPrefix}-submit-hint`}
          id={hintId}
        >
          {submitHint}
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
        aria-describedby={showsHint ? hintId : undefined}
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
    </>
  )
}
