import { clsx } from 'clsx'
import { useId, type ComponentProps, type ReactNode } from 'react'

/** 職員の登録と基本の情報の編集の、入力の欄と選択の欄のクラス名。 */
export const staffFieldClassName =
  'min-h-11 w-full rounded-8 bg-surface px-3 text-body ring-1 ring-border-field ring-inset focus-visible:focus-ring disabled:bg-surface-disabled disabled:text-text-disabled aria-invalid:ring-2 aria-invalid:ring-danger'

export type StaffFieldProps = {
  label: string
  /** 欄の下に出す補足の文。 */
  hint?: ReactNode
  /** 欄の下に出す誤りの文。あれば欄の枠を強める。 */
  error?: string
  /** 誤りの文の testid。 */
  errorTestId?: string
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}

/** 見出し、欄、補足の文、誤りの文を縦に並べる。children に、欄に付ける id と誤りの属性を渡す。 */
export const StaffField = ({ label, hint, error, errorTestId, children }: StaffFieldProps) => {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint !== undefined && hintId, error !== undefined && errorId]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label className="text-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        ...(error !== undefined && { 'aria-invalid': true }),
        ...(describedBy !== '' && { 'aria-describedby': describedBy }),
      })}
      {hint !== undefined && (
        <span className="text-caption text-text-secondary" id={hintId}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span
          className="text-caption text-danger"
          data-testid={errorTestId}
          id={errorId}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}

export type StaffSelectProps = Omit<ComponentProps<'select'>, 'children'> & {
  options: readonly { id: string; name: string }[] | undefined
}

/** 部署、チーム、役職の選択の欄。選択肢を読み終えるまでは押せない。 */
export const StaffSelect = ({ options, disabled, className, ...props }: StaffSelectProps) => (
  <select
    className={clsx(staffFieldClassName, className)}
    disabled={disabled === true || options === undefined}
    {...props}
  >
    {options?.map((option) => (
      <option key={option.id} value={option.id}>
        {option.name}
      </option>
    ))}
  </select>
)

/** 名前の順に並べた選択肢を返す。 */
export const sortByName = <T extends { name: string }>(items: readonly T[] | undefined) =>
  items === undefined ? undefined : [...items].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
