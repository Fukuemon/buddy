import { clsx } from 'clsx'
import { useRef, type ReactNode } from 'react'

import { useModalDialog } from '../ModalDialog/useModalDialog'

export type DialogProps = {
  /** alertdialog は、取り消せない操作を確認するダイアログに使う。 */
  role?: 'dialog' | 'alertdialog'
  /** ダイアログの名前になるタイトルの要素の id。 */
  labelledBy: string
  /** 覆いを押すか Escape キーを押したときに呼ぶ。canClose が false の間は呼ばない。 */
  onClose: () => void
  /** false の間は、覆いと Escape キーで閉じない。送っている間に渡す。 */
  canClose?: boolean
  /** narrow は、確認のダイアログの幅にする。 */
  width?: 'default' | 'narrow'
  children: ReactNode
  'data-testid'?: string
}

/**
 * 画面の上に重ねて出す、小さい確認と入力のダイアログ。`<dialog>` の showModal で開き、後ろの画面を操作できなくする。
 * 中身は DialogHeader、DialogBody、DialogFooter で組む。
 * 閉じる（外す）と、開く前にフォーカスがあった要素へ戻す。幅 768px 未満では、左右に余白を残して画面の幅に合わせる。
 */
export const Dialog = ({
  role = 'dialog',
  labelledBy,
  onClose,
  canClose = true,
  width = 'default',
  children,
  'data-testid': testId,
}: DialogProps) => {
  // タイトルは Tab で移れないので、useModalDialog の Shift+Tab の回り込みの起点にしない
  const titleRef = useRef<HTMLElement>(null)
  // 覆い、Escape、止められない cancel の後の close は useModalDialog が扱う。canClose が false なら閉じずに開き直す
  const ref = useModalDialog({
    isOpen: true,
    onCloseRequest: () => {
      if (canClose) onClose()
    },
    getInitialFocus: () => null,
    titleRef,
  })

  return (
    <dialog
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-8 border-0 bg-surface p-0 text-text shadow-3 backdrop:bg-overlay',
        width === 'narrow' ? 'max-w-md' : 'max-w-lg',
      )}
      data-testid={testId}
      ref={ref}
      role={role}
    >
      {children}
    </dialog>
  )
}

export type DialogHeaderProps = {
  /** タイトルの要素に付ける id。Dialog の labelledBy と同じ値を渡す。 */
  titleId: string
  title: ReactNode
  /** タイトルの右に置く要素。? のヘルプを置く。 */
  titleAddon?: ReactNode
  /** 右上の閉じるボタン（×）を押したときに呼ぶ。何も変えずに閉じる。 */
  onClose: () => void
  /** true の間は、閉じるボタンを押せない。送っている間に渡す。 */
  isCloseDisabled?: boolean
  closeTestId?: string
}

/** 入力のダイアログのヘッダー。左にタイトル、右上に閉じるボタン（×）を置く。 */
export const DialogHeader = ({
  titleId,
  title,
  titleAddon,
  onClose,
  isCloseDisabled = false,
  closeTestId,
}: DialogHeaderProps) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-5">
    <div className="relative flex min-h-11 min-w-0 items-center gap-1">
      <h2 className="text-heading-sm" id={titleId}>
        {title}
      </h2>
      {titleAddon}
    </div>
    <button
      aria-disabled={isCloseDisabled || undefined}
      aria-label="閉じる"
      className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:text-text-disabled"
      data-testid={closeTestId}
      onClick={() => {
        if (!isCloseDisabled) onClose()
      }}
      type="button"
    >
      <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
        <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  </div>
)

/** ダイアログの本文。項目を縦に積む。 */
export const DialogBody = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-4 p-5">{children}</div>
)

export type DialogFooterProps = {
  /** 送れなかったときの文。ボタンの左に出す。isBlock なら、ボタンの上に幅いっぱいで出す。 */
  error?: { message: ReactNode; testId?: string; isBlock?: boolean }
  /** 右に寄せて並べるボタン。「キャンセル」、確定のボタンの順に渡す。 */
  children: ReactNode
}

/** ダイアログのフッター。右にボタンを並べ、送れなかったときの文をその左に出す。 */
export const DialogFooter = ({ error, children }: DialogFooterProps) => (
  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
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
    {children}
  </div>
)
