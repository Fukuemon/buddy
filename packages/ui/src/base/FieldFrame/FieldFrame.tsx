import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type FieldFrameProps = {
  htmlFor: string
  label: string
  icon?: ReactNode
  error?: string
  /** エラーの文の要素の id。中の入力欄の aria-describedby に同じ値を渡す。 */
  errorId: string
  isWide?: boolean
  children: ReactNode
}

/**
 * 入力の枠。上に小さいラベル、右にアイコン、下にエラーを出す。DatePicker などが中で使う。
 * 中の入力欄には fieldErrorProps の属性を付け、エラーの文と結び付ける。
 */
export const FieldFrame = ({
  htmlFor,
  label,
  icon,
  error,
  errorId,
  isWide = false,
  children,
}: FieldFrameProps) => (
  <div className={clsx('font-normal', isWide ? 'w-full' : 'w-80')}>
    <label
      className={clsx(
        'relative flex h-14 cursor-pointer flex-col justify-center rounded-8 bg-surface px-4 ring-1 ring-border-field transition duration-100 ring-inset',
        'focus-within:bg-primary-surface has-[:focus-visible]:focus-ring',
        error !== undefined && 'ring-2 ring-danger',
      )}
      htmlFor={htmlFor}
    >
      <span className="pointer-events-none text-caption text-text-secondary">{label}</span>
      {children}
      {icon !== undefined && (
        <span className="pointer-events-none absolute inset-y-0 right-1.5 my-auto grid size-10 place-items-center">
          {icon}
        </span>
      )}
    </label>
    {error !== undefined && (
      <span className="mt-1 block text-caption text-danger" id={errorId} role="alert">
        {error}
      </span>
    )}
  </div>
)

/** FieldFrame の中に置く input のクラス名。 */
export const fieldInputClassName =
  'w-full bg-transparent pr-10 text-body-dense outline-none disabled:text-text-disabled [&::-webkit-calendar-picker-indicator]:opacity-0'

/** 入力欄に付ける、エラーの有無と、エラーの文への参照の属性を返す。エラーがなければ何も付けない。 */
export const fieldErrorProps = (error: string | undefined, errorId: string) =>
  error === undefined ? {} : ({ 'aria-invalid': true, 'aria-describedby': errorId } as const)
