import { useId, type ReactNode } from 'react'

/** FormField の中に置く input と select のクラス名。誤りがあると枠を強め、無効では面と文字を無効の色にする。 */
export const formFieldControlClassName =
  'min-h-11 w-full rounded-8 bg-surface px-3 text-body ring-1 ring-border-field ring-inset focus-visible:focus-ring disabled:bg-surface-disabled disabled:text-text-disabled aria-invalid:ring-2 aria-invalid:ring-danger'

/** FormField が children に渡す、欄に付ける属性。 */
export type FormFieldControlProps = {
  id: string
  /** isGroup のときだけ、見出しの要素の id を渡す。radiogroup の要素に付ける。 */
  'aria-labelledby'?: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export type FormFieldProps = {
  label: string
  /** 欄の下に出す補足の文。 */
  hint?: ReactNode
  /** 欄の下に出す誤りの文。あれば欄に aria-invalid を付け、枠を強める。 */
  error?: string
  /** 誤りの文の data-testid。 */
  errorTestId?: string
  /** true なら、見出しを label ではなく見出しの要素にし、ラジオボタンの組のように複数の欄を 1 つの見出しで束ねる。 */
  isGroup?: boolean
  /** 欄を描く。渡す属性を欄（isGroup では組の要素）に付ける。 */
  children: (props: FormFieldControlProps) => ReactNode
}

/**
 * 入力の欄の見出し、欄、補足の文、誤りの文を縦に並べる。見出しを欄に結び付け、補足と誤りの文を aria-describedby で欄に結び付ける。
 * 誤りの文は role="alert" で読み上げる。
 */
export const FormField = ({
  label,
  hint,
  error,
  errorTestId,
  isGroup = false,
  children,
}: FormFieldProps) => {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint !== undefined && hintId, error !== undefined && errorId]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {isGroup ? (
        <span className="text-label" id={labelId}>
          {label}
        </span>
      ) : (
        <label className="text-label" htmlFor={id} id={labelId}>
          {label}
        </label>
      )}
      {children({
        id,
        ...(isGroup && { 'aria-labelledby': labelId }),
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
