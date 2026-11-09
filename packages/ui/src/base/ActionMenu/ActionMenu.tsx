import { clsx } from 'clsx'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { useDismiss } from '../../hooks/useDismiss'
import { buttonClassName } from '../Button/Button'

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
  /** 項目の文言の下に小さく出す補足。押せない項目では、押せない理由を書く。 */
  description?: string
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
  /**
   * 渡すと、「…」の代わりに、この文言と開く向きの印を Button の secondary と同じ見た目で出す。
   * ボタンの名前はこの文言になり、label は使わない。モーダルの下端の「編集」のように、操作の名前を見せるときに使う。
   */
  triggerLabel?: string
  /** メニューを開く向き。top はボタンの上に開く。モーダルの下端のように、下に場所が無いときに使う。 */
  placement?: 'bottom' | 'top'
}

/**
 * 「…」のボタン（triggerLabel を渡すと文言のボタン）と、押すとボタンの下の右端にそろえて開くメニュー。placement が top なら上に開く。
 * 項目を選ぶ（staysOpenUntilSettled の項目は、送った結果が返る）か、もう一度押すか、メニューの外を押すか、Escape キーを押すと閉じ、Escape キーではフォーカスをボタンに戻す。
 * 開くと、最初の項目にフォーカスを移す。
 */
export const ActionMenu = ({
  label,
  items,
  'data-testid': testId,
  menuTestId = `${testId}-list`,
  triggerLabel,
  placement = 'bottom',
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
        aria-label={triggerLabel === undefined ? label : undefined}
        className={
          triggerLabel === undefined
            ? 'grid size-11 place-items-center rounded-8 text-text hover:bg-surface-subtle focus-visible:focus-ring'
            : clsx(buttonClassName({ variant: 'secondary' }), 'gap-2')
        }
        data-testid={testId}
        onClick={() => setOpen(!isOpen)}
        ref={buttonRef}
        type="button"
      >
        {triggerLabel === undefined ? (
          <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
            <circle cx="4" cy="10" fill="currentColor" r="1.6" />
            <circle cx="10" cy="10" fill="currentColor" r="1.6" />
            <circle cx="16" cy="10" fill="currentColor" r="1.6" />
          </svg>
        ) : (
          <>
            {triggerLabel}
            <svg aria-hidden height="16" viewBox="0 0 16 16" width="16">
              <path
                d={placement === 'top' ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </>
        )}
      </button>
      {isOpen && (
        <div
          aria-label={triggerLabel ?? label}
          className={clsx(
            'absolute right-0 z-10 flex min-w-48 flex-col overflow-hidden rounded-8 border border-border bg-surface py-1 shadow-3',
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          data-testid={menuTestId}
          id={menuId}
          ref={menuRef}
          role="menu"
        >
          {ordered.map((item) => (
            <button
              aria-describedby={
                item.description === undefined ? undefined : `${menuId}-${item['data-testid']}`
              }
              aria-disabled={item.disabled || undefined}
              className={clsx(
                'min-h-11 px-4 text-left text-body hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:cursor-not-allowed aria-disabled:text-text-disabled',
                item.description === undefined
                  ? 'whitespace-nowrap'
                  : 'flex w-72 max-w-[calc(100vw-2rem)] flex-col py-2',
                item.isDanger && 'border-t border-border text-danger',
              )}
              data-testid={item['data-testid']}
              key={item['data-testid']}
              onClick={() => {
                if (item.disabled) return
                if (item.staysOpenUntilSettled) {
                  // 決着したら、閉じると消える項目から開くボタンへフォーカスを戻す。
                  // 送っている間に閉じたか、閉じて開き直していたら、押したときのメニューの要素と違うので、閉じずにフォーカスも動かさない
                  const menu = menuRef.current
                  const settled = () => {
                    if (menu === null || menuRef.current !== menu) return
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
              {item.description !== undefined && (
                <span
                  className="text-caption text-text-secondary"
                  id={`${menuId}-${item['data-testid']}`}
                >
                  {item.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
