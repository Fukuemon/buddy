import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react'

export type CalendarDialogProps = {
  /** alertdialog は、取り消せない操作を確かめるダイアログに使う。 */
  role?: 'dialog' | 'alertdialog'
  /** ダイアログの名前になるタイトルの要素の id。 */
  labelledBy: string
  /** 覆いを押すか Escape キーを押したときに呼ぶ。canClose が false の間は呼ばない。 */
  onClose: () => void
  canClose?: boolean
  children: ReactNode
  'data-testid'?: string
}

/**
 * カレンダーの連携の画面に重ねて出すダイアログ。`<dialog>` の showModal で開き、後ろの一覧を操作できなくする。
 * 閉じると、開く前にフォーカスがあった要素へ戻す。幅 768px 未満では、左右に余白を残して画面の幅に合わせる。
 */
export const CalendarDialog = ({
  role = 'dialog',
  labelledBy,
  onClose,
  canClose = true,
  children,
  'data-testid': testId,
}: CalendarDialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  // Escape のデフォルトの動きはダイアログを閉じるので止め、閉じるかを呼び出す側に任せる
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    if (canClose) onClose()
  }

  return (
    // 覆いを押したときは、クリックの対象が dialog 自身になる。キーボードでは Escape で閉じる
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-8 border-0 bg-surface p-0 text-text shadow-3 backdrop:bg-overlay"
      data-testid={testId}
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget && canClose) onClose()
      }}
      ref={ref}
      role={role}
    >
      <div className="flex flex-col gap-5 p-5">{children}</div>
    </dialog>
  )
}
