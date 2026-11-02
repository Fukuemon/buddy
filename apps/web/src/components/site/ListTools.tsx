import { Button } from '@buddy/ui'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type FilterSelectProps<T extends string> = {
  /** 選択肢の前に付ける名前。「部署: すべて」のように出す。 */
  label: string
  value: T
  /** 選択肢。value が空の選択肢は「すべて」に当たる。 */
  options: readonly { value: T; label: string }[]
  /** true なら、値を選んでいるとみなして枠を太くする。省くと、value が空でないときに太くする。 */
  isOn?: boolean
  disabled?: boolean
  onChange: (value: T) => void
  'data-testid'?: string
}

/** 一覧の絞り込みのセレクト。値を選んだものは枠を太くし、選んだ名前を「部署: 看護部」の形で出す。 */
export const FilterSelect = <T extends string>({
  label,
  value,
  options,
  isOn = value !== '',
  disabled = false,
  onChange,
  'data-testid': testId,
}: FilterSelectProps<T>) => (
  <select
    aria-label={label}
    className={clsx(
      'h-10 min-h-11 rounded-8 bg-surface px-3 text-body-dense ring-inset focus-visible:focus-ring disabled:bg-surface-disabled disabled:text-text-disabled',
      isOn ? 'font-bold ring-2 ring-text' : 'ring-1 ring-border-field',
    )}
    data-testid={testId}
    disabled={disabled}
    onChange={(event) => {
      const selected = options.find((option) => option.value === event.target.value)
      if (selected !== undefined) onChange(selected.value)
    }}
    value={value}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {`${label}: ${option.label}`}
      </option>
    ))}
  </select>
)

/** 一覧の上の、名前の検索、絞り込み、件数を折り返して並べる行。件数は右端に置く。 */
export const ListTools = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3">{children}</div>
)

/** 絞り込みの後の件数。ListTools の右端に置く。 */
export const ListCount = ({
  children,
  'data-testid': testId,
}: {
  children: ReactNode
  'data-testid'?: string
}) => (
  <span
    aria-live="polite"
    className="ml-auto text-caption whitespace-nowrap text-text-secondary"
    data-testid={testId}
  >
    {children}
  </span>
)

export type ListEmptyProps = {
  message: string
  /** 絞り込みを外すボタンの文字と、押したときの処理。 */
  clearLabel: string
  onClear: () => void
  'data-testid'?: string
  clearTestId?: string
}

/** 絞り込みで 0 件のときに、表の代わりに出す知らせと、絞り込みを外すボタン。 */
export const ListEmpty = ({
  message,
  clearLabel,
  onClear,
  'data-testid': testId,
  clearTestId,
}: ListEmptyProps) => (
  <div
    className="flex flex-col items-center gap-3 px-4 py-12 text-center text-text-secondary"
    data-testid={testId}
  >
    <p className="text-body">{message}</p>
    <Button data-testid={clearTestId} onClick={onClear} size="S" variant="secondary">
      {clearLabel}
    </Button>
  </div>
)
