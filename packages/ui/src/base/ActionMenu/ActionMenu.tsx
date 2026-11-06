import { clsx } from 'clsx'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { useDismiss } from '../../hooks/useDismiss'

/**
 * メニューの項目。isDanger の項目はデータを失う操作で、赤くし、ほかの項目と線で分けて最後に置く。
 * staysOpenUntilSettled の項目は、ダイアログを開かずにその場で送る操作で、押してもメニューを閉じず、
 * onSelect が返す Promise が決着してから閉じる。拒まれても閉じ、理由は呼び出す側が出す。送っている間は、項目の文言を送っていることを示す文言にし、disabled にする。
 */
export type ActionMenuItem = {
  label: string
  onSelect: () => void | Promise<unknown>
  'data-testid': string
  isDanger?: boolean
  disabled?: boolean
  staysOpenUntilSettled?: boolean
}

export type ActionMenuProps = {
  /** 開くボタンの読み上げる名前（「青木 一郎の操作」）。 */
  label: string
  items: readonly ActionMenuItem[]
  /** 開くボタンの testid。 */
  'data-testid': string
  /** メニューの testid。省くと `<開くボタンの testid>-list` にする。 */
  menuTestId?: string
}

/**
 * 「…」のボタンと、押すとボタンの下の右端にそろえて開くメニュー。
 * 項目を選ぶ（staysOpenUntilSettled の項目は、送った結果が返る）か、もう一度押すか、メニューの外を押すか、Escape キーを押すと閉じ、Escape キーではフォーカスをボタンに戻す。
 * 開くと、最初の項目にフォーカスを移す。
 */
export const ActionMenu = ({
  label,
  items,
  'data-testid': testId,
  menuTestId = `${testId}-list`,
}: ActionMenuProps) => {
  const menuId = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isOpen, setOpen] = useState(false)
  const close = useCallback((reason: 'outside' | 'escape') => {
    setOpen(false)
    if (reason === 'escape') buttonRef.current?.focus()
  }, [])
  useDismiss(ref, isOpen, close)
  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [isOpen])

  const ordered = [...items.filter((i) => !i.isDanger), ...items.filter((i) => i.isDanger)]
  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="grid size-11 place-items-center rounded-8 text-text hover:bg-surface-subtle focus-visible:focus-ring"
        data-testid={testId}
        onClick={() => setOpen(!isOpen)}
        ref={buttonRef}
        type="button"
      >
        <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
          <circle cx="4" cy="10" fill="currentColor" r="1.6" />
          <circle cx="10" cy="10" fill="currentColor" r="1.6" />
          <circle cx="16" cy="10" fill="currentColor" r="1.6" />
        </svg>
      </button>
      {isOpen && (
        <div
          aria-label={label}
          className="absolute top-full right-0 z-10 mt-1 flex min-w-48 flex-col overflow-hidden rounded-8 border border-border bg-surface py-1 shadow-3"
          data-testid={menuTestId}
          id={menuId}
          ref={menuRef}
          role="menu"
        >
          {ordered.map((item) => (
            <button
              aria-disabled={item.disabled || undefined}
              className={clsx(
                'min-h-11 px-4 text-left text-body whitespace-nowrap hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:text-text-disabled',
                item.isDanger && 'border-t border-border text-danger',
              )}
              data-testid={item['data-testid']}
              key={item['data-testid']}
              onClick={() => {
                if (item.disabled) return
                if (item.staysOpenUntilSettled) {
                  // 決着したら、閉じると消える項目から開くボタンへフォーカスを戻す。送っている間に外を押して閉じていたら、フォーカスを動かさない
                  const settled = () => {
                    if (menuRef.current === null) return
                    buttonRef.current?.focus()
                    setOpen(false)
                  }
                  void Promise.resolve(item.onSelect()).then(settled, settled)
                  return
                }
                // 項目は閉じると消えるので、先に開くボタンへ戻す。onSelect が開くダイアログは、このボタンへフォーカスを返す
                buttonRef.current?.focus()
                setOpen(false)
                void item.onSelect()
              }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
