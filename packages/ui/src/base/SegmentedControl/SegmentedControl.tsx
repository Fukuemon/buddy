import { clsx } from 'clsx'
import { useId } from 'react'

export type SegmentedControlOption<Id extends string> = {
  id: Id
  label: string
}

export type SegmentedControlProps<Id extends string> = {
  /** 選択肢の組の名前。画面には出さず、支援技術が読み上げる。 */
  label: string
  options: readonly SegmentedControlOption<Id>[]
  value: Id
  onChange: (id: Id) => void
  /** white は、surface-subtle の面の上に置くときに使う。 */
  variant?: 'default' | 'white'
  /** 組の data-testid。選択肢の radio には `<data-testid>-<id>` を付ける。 */
  'data-testid'?: string
}

/**
 * 2 から 4 個の選択肢から 1 つを選び、すぐに表示を切り替える。ラジオボタンの組として振る舞う。
 * Tab で選ばれている選択肢に移り、矢印キーで選び直す。選択の状態は持たず、value と onChange で親が持つ。
 */
export const SegmentedControl = <Id extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'default',
  'data-testid': testId,
}: SegmentedControlProps<Id>) => {
  const name = useId()

  return (
    <div
      aria-label={label}
      className={clsx(
        'flex w-full gap-1 rounded-8 border p-0.5',
        variant === 'white' ? 'border-surface bg-surface' : 'border-border bg-surface-subtle',
      )}
      data-testid={testId}
      role="radiogroup"
    >
      {options.map((option) => {
        const checked = option.id === value
        return (
          <label
            className={clsx(
              'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-6 border px-2 text-label transition-colors has-[:focus-visible]:focus-ring',
              checked
                ? clsx(
                    'border-border-field text-text',
                    variant === 'white' ? 'bg-surface-subtle' : 'bg-surface',
                  )
                : 'border-transparent text-text-secondary hover:text-text',
            )}
            key={option.id}
          >
            <input
              checked={checked}
              className="sr-only"
              data-testid={testId === undefined ? undefined : `${testId}-${option.id}`}
              name={name}
              onChange={() => onChange(option.id)}
              type="radio"
              value={option.id}
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
