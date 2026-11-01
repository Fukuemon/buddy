import { useId, useState, type ReactNode } from 'react'

export type MoreTextProps = {
  /** 常に出す 1 文。 */
  summary: ReactNode
  /** 「詳しく」で開く続きの説明。手順のように、読みながら操作する説明を入れる。 */
  children: ReactNode
  /** true なら、開いた状態で始める。 */
  defaultOpen?: boolean
  /** 「詳しく」のボタンの testid。 */
  toggleTestId?: string
  /** 続きの説明の testid。 */
  bodyTestId?: string
}

/**
 * 「詳しく」で開く補足。常に出す 1 文の下に「詳しく」のボタンを置き、押すと続きの説明を開き、もう一度押すと閉じる。
 * 初めてのときだけ要る説明を、毎回は読ませないために使う。
 */
export const MoreText = ({
  summary,
  children,
  defaultOpen = false,
  toggleTestId,
  bodyTestId,
}: MoreTextProps) => {
  const bodyId = useId()
  const [isOpen, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-body">{summary}</p>
      <button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        className="inline-flex min-h-11 items-center gap-1 rounded-8 text-label text-primary hover:underline focus-visible:focus-ring"
        data-testid={toggleTestId}
        onClick={() => setOpen(!isOpen)}
        type="button"
      >
        詳しく
        <svg
          aria-hidden
          className={isOpen ? 'rotate-180' : undefined}
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <div className="text-body" data-testid={bodyTestId} hidden={!isOpen} id={bodyId}>
        {children}
      </div>
    </div>
  )
}
