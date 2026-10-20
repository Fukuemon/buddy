import { useEffect, useId, type ReactNode } from 'react'

import CloseIcon from '#/assets/icons/close.svg?react'

export type ModalProps = {
  isOpen: boolean
  /** 閉じるボタン、背景のクリック、Escape キーで呼ぶ。閉じるかどうかは呼び出す側が決める。 */
  onCloseRequest?: () => void
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

/** 画面の中央に重ねて出すダイアログ。幅 720px 未満では画面いっぱいに出す。 */
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

  const requestClose = () => {
    if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return
    onCloseRequest?.()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        className="absolute inset-0 bg-overlay backdrop-blur-lg"
        data-testid="modal-overlay"
        onClick={requestClose}
      />
      <dialog
        aria-labelledby={title === undefined ? undefined : titleId}
        aria-modal
        className="absolute m-0 max-h-none max-w-none border-0 p-0 inset-x-0 bottom-0 top-[1dvh] flex flex-col overflow-auto rounded-t-8 bg-surface shadow-3 desktop:inset-auto desktop:top-1/2 desktop:left-1/2 desktop:max-h-[90dvh] desktop:w-[720px] desktop:-translate-1/2 desktop:rounded-8"
        data-testid={testId}
        open
      >
        <div className="sticky top-0 z-10 flex items-center gap-4 rounded-t-8 border-b border-border bg-surface p-3">
          <button
            aria-label="閉じる"
            className="grid place-items-center rounded-8 p-2 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="modal-close"
            onClick={requestClose}
            type="button"
          >
            <CloseIcon height={24} width={24} />
          </button>
          {headerContent !== undefined && <div className="flex-1">{headerContent}</div>}
          {title !== undefined && (
            <h3 className="text-heading-sm" id={titleId}>
              {title}
            </h3>
          )}
        </div>
        <div className="flex-1">{children}</div>
        {stickyFooter !== undefined && (
          <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-8 border-t border-border bg-surface px-5 py-4">
            {stickyFooter}
          </div>
        )}
      </dialog>
    </div>
  )
}
