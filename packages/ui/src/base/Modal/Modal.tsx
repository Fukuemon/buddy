import { useId, useRef, type ReactNode } from 'react'

import { CloseIcon } from '../../icons/CloseIcon'
import { useModalDialog } from '../ModalDialog/useModalDialog'

export type ModalProps = {
  isOpen: boolean
  /** 閉じるボタン、背景のクリック、Escape キーで呼ぶ。閉じるかどうかは呼び出す側が決める。 */
  onCloseRequest?: () => void
  /** ダイアログの名前。開いたときに、ここへフォーカスを移す。 */
  title?: string
  /** ヘッダーのタイトルの右に置き、右端に寄せて出す要素。 */
  headerContent?: ReactNode
  /** 下端に固定して出す領域。送信のボタンを置く。 */
  stickyFooter?: ReactNode
  /** true のとき、閉じる前に変更を破棄してよいかを確認する。 */
  isDirty?: boolean
  children: ReactNode
  'data-testid'?: string
}

const DISCARD_CONFIRM_MESSAGE = '変更が破棄されますがよろしいですか？'

/**
 * 画面の上に重ねて出すモーダルのダイアログ。`<dialog>` の showModal で開き、後ろの画面を操作できなくする。
 * 開くとタイトル（タイトルがなければ閉じるボタン）にフォーカスを移し、Tab はダイアログの中だけを回る。
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
  const titleRef = useRef<HTMLHeadingElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const requestClose = () => {
    if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return
    onCloseRequest?.()
  }
  const dialogRef = useModalDialog({
    isOpen,
    onCloseRequest: requestClose,
    getInitialFocus: () => titleRef.current ?? closeButtonRef.current,
    titleRef,
  })

  if (!isOpen) return null

  return (
    <dialog
      aria-labelledby={title === undefined ? undefined : titleId}
      className="m-0 mt-auto h-[99dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-8 border-0 bg-surface p-0 text-text shadow-3 backdrop:bg-overlay backdrop:backdrop-blur-lg desktop:m-auto desktop:h-fit desktop:max-h-[90dvh] desktop:w-[720px] desktop:rounded-8"
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
          {title !== undefined && (
            <h2 className="text-heading-sm outline-none" id={titleId} ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
          )}
          {headerContent !== undefined && (
            <div className="flex min-w-0 flex-1 justify-end">{headerContent}</div>
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
