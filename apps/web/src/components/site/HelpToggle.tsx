import { useCallback, useId, useRef, useState, type ReactNode } from 'react'

import { useDismiss } from './useDismiss'

export type HelpToggleProps = {
  /** 開くボタンの testid。説明には `<testid>-text` を付ける。 */
  'data-testid': string
  children: ReactNode
}

/**
 * 見出しの右に置く ? のヘルプ。押すと見出しの下に説明を開き、もう一度押すか、説明の外を押すか、Escape キーを押すと閉じる。
 * 親の見出しの行に `relative` を付け、説明をその下にそろえる。
 */
export const HelpToggle = ({ 'data-testid': testId, children }: HelpToggleProps) => {
  const panelId = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const [isOpen, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, isOpen, close)
  return (
    <span className="inline-flex" ref={ref}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="ヘルプ"
        className="grid size-11 place-items-center rounded-full focus-visible:focus-ring"
        data-testid={testId}
        onClick={() => setOpen(!isOpen)}
        type="button"
      >
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-full border border-border-field text-caption text-text-secondary"
        >
          ?
        </span>
      </button>
      <p
        className="absolute top-full left-0 z-10 mt-1 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-8 border border-border bg-surface px-3 py-2 text-body shadow-3"
        data-testid={`${testId}-text`}
        hidden={!isOpen}
        id={panelId}
      >
        {children}
      </p>
    </span>
  )
}
