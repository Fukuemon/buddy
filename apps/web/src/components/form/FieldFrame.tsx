import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type FieldFrameProps = {
  htmlFor: string
  label: string
  icon?: ReactNode
  error?: string
  isWide?: boolean
  children: ReactNode
}

/** 入力の枠。上に小さいラベル、右にアイコン、下にエラーを出す。DatePicker などが中で使う。 */
export const FieldFrame = ({
  htmlFor,
  label,
  icon,
  error,
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
      <span className="mt-1 block text-caption text-danger" role="alert">
        {error}
      </span>
    )}
  </div>
)

/** FieldFrame の中に置く input のクラス名。 */
export const fieldInputClassName =
  'w-full bg-transparent pr-10 text-body-dense outline-none disabled:text-text-disabled [&::-webkit-calendar-picker-indicator]:opacity-0'
