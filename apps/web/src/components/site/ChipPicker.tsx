import { clsx } from 'clsx'
import { useId, useRef, useState, type KeyboardEvent } from 'react'

import { useDismiss } from './useDismiss'

/** 選べるもの。 */
export type ChipPickerOption = { id: string; name: string }

export type ChipPickerProps = {
  /** 選んでいるものの見出し。チップのまとまりの名前にもなる。 */
  label: string
  /** 足す欄の文字と、読み上げる名前。例: 「＋ 職員を選ぶ」と「対象の職員を選ぶ」。 */
  addLabel: string
  addAriaLabel: string
  /** 候補が 1 つも無いときの文。 */
  emptyLabel: string
  /** 候補の全て。選んでいないものを名前の順に候補に並べる。 */
  options: readonly ChipPickerOption[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
  disabled?: boolean
  /** testid の接頭辞。チップに `<接頭辞>-<id>`、× に `-remove-<id>`、足す欄に `-add`、候補に `-option-<id>` を付ける。 */
  testIdPrefix: string
}

/**
 * 選んでいるものだけを × 付きのチップで並べ、最後の欄に名前を入れて候補から 1 つ足す選択。
 * 候補は下の矢印キーで移り、上下の矢印キーで移り合い、Enter キーで足す。外を押すか Escape キーで閉じ、Escape キーは外側のダイアログを閉じない。
 * × で外すと、フォーカスを次のチップの × か、足す欄に移す。
 */
export const ChipPicker = ({
  label,
  addLabel,
  addAriaLabel,
  emptyLabel,
  options,
  selected,
  onChange,
  disabled = false,
  testIdPrefix,
}: ChipPickerProps) => {
  const labelId = useId()
  const listId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chipsRef = useRef<HTMLUListElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  useDismiss(anchorRef, isOpen, close)

  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id
  const candidates = options
    .filter((o) => !selected.includes(o.id) && o.name.includes(query.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  const add = (id: string) => {
    onChange([...selected, id])
    close()
    inputRef.current?.focus()
  }
  const remove = (id: string, index: number) => {
    onChange(selected.filter((s) => s !== id))
    const next = chipsRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')[index + 1]
    if (next !== undefined) next.focus()
    else inputRef.current?.focus()
  }
  /** 候補の index 番目のボタンにフォーカスを移す。範囲の外なら足す欄に戻す。 */
  const focusCandidate = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button')
    const target = buttons?.[index]
    if (target !== undefined) target.focus()
    else inputRef.current?.focus()
  }
  const onListKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    focusCandidate(
      event.key === 'ArrowDown' ? Math.min(index + 1, candidates.length - 1) : index - 1,
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-secondary" id={labelId}>
        {label}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-wrap items-center gap-2" ref={chipsRef}>
        {selected.map((id, index) => (
          <li
            className="flex min-h-11 items-center gap-1 rounded-8 pl-3 text-body-dense font-bold ring-2 ring-text ring-inset"
            data-testid={`${testIdPrefix}-${id}`}
            key={id}
          >
            {nameOf(id)}
            <button
              aria-label={`${nameOf(id)} を外す`}
              className="grid size-11 place-items-center rounded-8 focus-visible:focus-ring"
              data-remove
              data-testid={`${testIdPrefix}-remove-${id}`}
              disabled={disabled}
              onClick={() => remove(id, index)}
              type="button"
            >
              <svg aria-hidden height="16" viewBox="0 0 20 20" width="16">
                <path
                  d="M5 5l10 10M15 5 5 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <div className="relative self-start" ref={anchorRef}>
        <input
          aria-controls={listId}
          aria-label={addAriaLabel}
          className={clsx(
            'min-h-11 w-48 rounded-8 bg-surface px-3 text-body-dense ring-inset placeholder:text-text-secondary focus-visible:focus-ring disabled:bg-surface-disabled',
            isOpen ? 'ring-2 ring-text' : 'ring-1 ring-border-field',
          )}
          data-testid={`${testIdPrefix}-add`}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onClick={() => (isOpen ? close() : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            setOpen(true)
            requestAnimationFrame(() => focusCandidate(0))
          }}
          placeholder={addLabel}
          ref={inputRef}
          value={query}
        />
        {isOpen && (
          <div
            className="absolute top-full left-0 z-10 mt-1 max-h-60 min-w-48 overflow-auto rounded-8 border border-border bg-surface py-1 shadow-3"
            data-testid={`${testIdPrefix}-options`}
            id={listId}
          >
            {candidates.length === 0 ? (
              <p className="px-4 py-2 text-body text-text-secondary">{emptyLabel}</p>
            ) : (
              <ul aria-label={`${label}の候補`} ref={listRef}>
                {candidates.map((option, index) => (
                  <li key={option.id}>
                    <button
                      className="block min-h-11 w-full px-4 text-left text-body whitespace-nowrap hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
                      data-testid={`${testIdPrefix}-option-${option.id}`}
                      onClick={() => add(option.id)}
                      onKeyDown={(event) => onListKeyDown(event, index)}
                      type="button"
                    >
                      {option.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
