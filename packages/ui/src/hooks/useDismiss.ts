import { useEffect, type RefObject } from 'react'

/**
 * isOpen の間、ref の要素の外を押すか Escape キーを押すと、どちらで閉じたかを渡して onDismiss を呼ぶ。
 * Escape キーは、外側のダイアログを閉じないように伝わりを止める。
 */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: (reason: 'outside' | 'escape') => void,
) => {
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return
      onDismiss('outside')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onDismiss('escape')
    }
    document.addEventListener('pointerdown', onPointerDown)
    // ダイアログの cancel より先に受けるため、捕捉の段で聞く
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [ref, isOpen, onDismiss])
}
