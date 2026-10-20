import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'

import { CloseIcon } from '../../icons/CloseIcon'

export type ModalProps = {
  isOpen: boolean
  /** 閉じるボタン、背景のクリック、Escape キーで呼ぶ。閉じるかどうかは呼び出す側が決める。 */
  onCloseRequest?: () => void
  /** ダイアログの名前。開いたときに、ここへフォーカスを移す。 */
  title?: string
  headerContent?: ReactNode
  /** 下端に固定して出す領域。送信のボタンを置く。 */
  stickyFooter?: ReactNode
  /** true のとき、閉じる前に変更を破棄してよいかを確かめる。 */
  isDirty?: boolean
  children: ReactNode
  'data-testid'?: string
}

const DISCARD_CONFIRM_MESSAGE = '変更が破棄されますがよろしいですか？'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const focusableElements = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getClientRects().length > 0,
  )

/**
 * 画面の上に重ねて出すモーダルのダイアログ。`<dialog>` の showModal で開き、後ろの画面を操作できなくする。
 * 開くと題（題がなければ閉じるボタン）にフォーカスを移し、Tab はダイアログの中だけを回る。
 * 閉じる（isOpen が false になるか、外す）と、開く前にフォーカスがあった要素へ戻す。
 * 幅 768px 未満では画面いっぱいに出す。
 */
export const Modal = ({
  isOpen,
  onCloseRequest,
  title,
  headerContent,
  stickyFooter,
  isDirty = false,
  children,
  'data-testid': testId,
}: ModalProps) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const requestClose = () => {
    if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return
    onCloseRequest?.()
  }
  const requestCloseFromDialog = useEffectEvent(requestClose)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen || dialog === null) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Escape の既定の動きはダイアログを閉じるので止め、閉じるかを呼び出す側に任せる。
    const handleCancel = (event: Event) => {
      event.preventDefault()
      requestCloseFromDialog()
    }
    // Escape を続けて押すと、ブラウザは cancel を止めさせずにダイアログを閉じる。閉じる要求として扱い、開き直す。
    const handleClose = () => {
      if (dialog.open || !dialog.isConnected) return
      requestCloseFromDialog()
      if (dialog.isConnected && !dialog.open) dialog.showModal()
    }
    // ::backdrop を押すと、クリックの対象は dialog 自身になる。中身は内側の div が受ける。
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) requestCloseFromDialog()
    }
    // showModal は後ろを操作できなくするが、最後の要素からの Tab はブラウザの UI へ抜けるので、先頭へ戻す。
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusableElements(dialog)
      const first = elements[0]
      const last = elements.at(-1)
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === titleRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleClick)
    dialog.addEventListener('keydown', handleKeyDown)
    if (!dialog.open) dialog.showModal()
    ;(titleRef.current ?? closeButtonRef.current)?.focus()

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleClick)
      dialog.removeEventListener('keydown', handleKeyDown)
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <dialog
      aria-labelledby={title === undefined ? undefined : titleId}
      className="m-0 mt-auto h-[99dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-8 border-0 bg-surface p-0 text-text shadow-3 backdrop:bg-overlay backdrop:backdrop-blur-lg desktop:m-auto desktop:h-auto desktop:max-h-[90dvh] desktop:w-[720px] desktop:rounded-8"
      data-testid={testId}
      ref={dialogRef}
    >
      <div className="flex h-full max-h-[inherit] flex-col overflow-auto">
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-surface p-3">
          <button
            aria-label="閉じる"
            className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="modal-close"
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
            <CloseIcon height={24} width={24} />
          </button>
          {headerContent !== undefined && <div className="flex-1">{headerContent}</div>}
          {title !== undefined && (
            <h2 className="text-heading-sm outline-none" id={titleId} ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
          )}
        </div>
        <div className="flex-1">{children}</div>
        {stickyFooter !== undefined && (
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-surface px-5 py-4">
            {stickyFooter}
          </div>
        )}
      </div>
    </dialog>
  )
}
