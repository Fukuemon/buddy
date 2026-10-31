import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'

export type PageLeadProps = {
  /** 常に出す 1 文。 */
  children: ReactNode
  /** 「詳しく」で開く続きの説明。初めてのときだけ要る説明を入れる。 */
  more: ReactNode
  /** 開くボタンに `<testId>-toggle`、続きの説明に `<testId>-more` を付ける。 */
  testId: string
}

/**
 * ページのタイトルの下の説明。常に 1 文を出し、続きの説明は「詳しく」のボタンで開閉する。
 * 開閉の形は、画面仕様書の規約（docs/screens/rules.md の「補足とヘルプ」）の「詳しく」に合わせる。閉じた状態で始める。
 */
export const PageLead = ({ children, more, testId }: PageLeadProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const moreId = useId()
  return (
    <div className="flex max-w-2xl flex-col items-start gap-2">
      <p className="text-body">{children}</p>
      <button
        aria-controls={moreId}
        aria-expanded={isOpen}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-8 px-2 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
        data-testid={`${testId}-toggle`}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        詳しく
        <span
          aria-hidden="true"
          className={clsx(
            'size-1.5 border-r-[1.5px] border-b-[1.5px] border-current',
            isOpen ? 'translate-y-px -rotate-135' : '-translate-y-0.5 rotate-45',
          )}
        />
      </button>
      <div
        className="border-l-4 border-border bg-surface-subtle px-4 py-3 text-body"
        data-testid={`${testId}-more`}
        hidden={!isOpen}
        id={moreId}
      >
        {more}
      </div>
    </div>
  )
}
