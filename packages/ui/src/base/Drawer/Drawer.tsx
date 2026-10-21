import { useId, useRef, type ReactNode } from 'react'

import { CloseIcon } from '../../icons/CloseIcon'
import { useModalDialog } from '../Modal/useModalDialog'

export type DrawerProps = {
  /** `<dialog>` の id。開くボタンの `aria-controls` に渡す。 */
  id?: string
  isOpen: boolean
  /** 閉じるボタン、背景のクリック、Escape キーで呼ぶ。閉じるかどうかは呼び出す側が決める。 */
  onCloseRequest: () => void
  /** ドロワーの名前。開いたときに、ここへフォーカスを移す。 */
  title: string
  children: ReactNode
  'data-testid'?: string
  closeButtonTestId?: string
}

/**
 * 画面の左端から重ねて出すモーダルのサイドバー。`<dialog>` の showModal で開き、後ろの画面を操作できなくする。
 * 開くと題にフォーカスを移し、Tab はドロワーの中だけを回る。閉じると、開く前にフォーカスがあった要素へ戻す。
 * 閉じている間も `<dialog>` を残すので、中身の状態と、開くボタンの `aria-controls` の参照先が保たれる。
 */
export const Drawer = ({
  id,
  isOpen,
  onCloseRequest,
  title,
  children,
  'data-testid': testId,
  closeButtonTestId = 'drawer-close',
}: DrawerProps) => {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useModalDialog({
    isOpen,
    onCloseRequest,
    getInitialFocus: () => titleRef.current,
  })

  return (
    <dialog
      aria-labelledby={titleId}
      className="m-0 h-dvh max-h-none w-80 max-w-[calc(100%-3rem)] overflow-hidden border-0 bg-surface p-0 text-text shadow-3 backdrop:bg-overlay"
      data-testid={testId}
      id={id}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border py-3 pr-3 pl-4">
          <h2 className="text-heading-sm outline-none" id={titleId} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <button
            aria-label="閉じる"
            className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid={closeButtonTestId}
            onClick={onCloseRequest}
            type="button"
          >
            <CloseIcon height={24} width={24} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </dialog>
  )
}
