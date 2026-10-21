import { useEffect, useEffectEvent, useRef } from 'react'

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

type UseModalDialogOptions = {
  isOpen: boolean
  /** 背景のクリックと Escape キーで呼ぶ。閉じるかどうかは呼び出す側が決める。 */
  onCloseRequest: () => void
  /** 開いたときにフォーカスを移す要素を返す。 */
  getInitialFocus: () => HTMLElement | null
}

/**
 * `<dialog>` をモーダルとして開閉する。返す ref を `<dialog>` に渡す。
 * isOpen が true の間は showModal で開き、getInitialFocus の要素にフォーカスを移し、Tab をダイアログの中だけで回す。
 * isOpen が false になるか外すと閉じ、開く前にフォーカスがあった要素へ戻す。
 */
export const useModalDialog = ({
  isOpen,
  onCloseRequest,
  getInitialFocus,
}: UseModalDialogOptions) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestClose = useEffectEvent(onCloseRequest)
  const initialFocus = useEffectEvent(getInitialFocus)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen || dialog === null) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Escape の既定の動きはダイアログを閉じるので止め、閉じるかを呼び出す側に任せる。
    // 止められない cancel（Escape を続けて押したとき）は、続く close に任せ、要求を 2 回出さない。
    const handleCancel = (event: Event) => {
      if (!event.cancelable) return
      event.preventDefault()
      requestClose()
    }
    // Escape を続けて押すと、ブラウザは cancel を止めさせずにダイアログを閉じる。閉じる要求として扱い、開き直す。
    const handleClose = () => {
      if (dialog.open || !dialog.isConnected) return
      requestClose()
      if (dialog.isConnected && !dialog.open) dialog.showModal()
    }
    // ::backdrop を押すと、クリックの対象は dialog 自身になる。中身は内側の div が受ける。
    // 中身から背景へドラッグしたときも click は dialog に届くので、押し始めも背景だったときだけ閉じる。
    let pressedOnBackdrop = false
    const handlePointerDown = (event: PointerEvent) => {
      pressedOnBackdrop = event.target === dialog
    }
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog && pressedOnBackdrop) requestClose()
      pressedOnBackdrop = false
    }
    // showModal は後ろを操作できなくするが、最後の要素からの Tab はブラウザの UI へ抜けるので、先頭へ戻す。
    // Tab で移れない要素（tabIndex が -1 の題）からの Shift+Tab も、最後の要素へ回す。
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusableElements(dialog)
      const first = elements[0]
      const last = elements.at(-1)
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      const isOutsideCycle = !(active instanceof HTMLElement) || !elements.includes(active)
      if (event.shiftKey && (active === first || isOutsideCycle)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('click', handleClick)
    dialog.addEventListener('keydown', handleKeyDown)
    if (!dialog.open) dialog.showModal()
    initialFocus()?.focus()

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('click', handleClick)
      dialog.removeEventListener('keydown', handleKeyDown)
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen])

  return dialogRef
}
