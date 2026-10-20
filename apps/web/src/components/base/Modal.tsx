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
        className="absolute inset-0 bg-black/56 backdrop-blur-lg"
        data-testid="modal-overlay"
        onClick={requestClose}
      />
      <dialog
        aria-labelledby={title === undefined ? undefined : titleId}
        aria-modal
        className="absolute m-0 max-h-none max-w-none border-0 p-0 inset-x-0 bottom-0 top-[1dvh] flex flex-col overflow-auto rounded-t-xl bg-gray-0 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:max-h-[90dvh] lg:w-[720px] lg:-translate-1/2 lg:rounded-3xl"
        data-testid={testId}
        open
      >
        <div className="sticky top-0 z-10 flex items-center gap-4 rounded-t-3xl border-b border-gray-100 bg-gray-0 p-3">
          <button
            aria-label="閉じる"
            className="grid place-items-center rounded-lg p-2 hover:bg-gray-10"
            data-testid="modal-close"
            onClick={requestClose}
            type="button"
          >
            <CloseIcon height={24} width={24} />
          </button>
          {headerContent !== undefined && <div className="flex-1">{headerContent}</div>}
          {title !== undefined && (
            <h3 className="text-[15px] font-bold" id={titleId}>
              {title}
            </h3>
          )}
        </div>
        <div className="flex-1">{children}</div>
        {stickyFooter !== undefined && (
          <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-3xl border-t border-gray-100 bg-gray-0 px-5 py-4">
            {stickyFooter}
          </div>
        )}
      </dialog>
    </div>
  )
}
