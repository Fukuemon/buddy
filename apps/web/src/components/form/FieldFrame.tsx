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
        'relative flex h-14 cursor-pointer flex-col justify-center rounded-[15px] bg-gray-0 px-4 shadow-[0_1px_2px_0_#e5e5e8] ring-1 ring-gray-200 transition duration-100 ring-inset',
        'focus-within:bg-action-bg focus-within:ring-2 focus-within:ring-action-main',
        error !== undefined && 'ring-incorrect-main',
      )}
      htmlFor={htmlFor}
    >
      <span className="pointer-events-none text-[11px] text-text-secondary">{label}</span>
      {children}
      {icon !== undefined && (
        <span className="pointer-events-none absolute inset-y-0 right-1.5 my-auto grid size-10 place-items-center">
          {icon}
        </span>
      )}
    </label>
    {error !== undefined && (
      <span className="mt-1 block text-xs text-incorrect-main" role="alert">
        {error}
      </span>
    )}
  </div>
)

/** FieldFrame の中に置く input のクラス名。 */
export const fieldInputClassName =
  'w-full bg-transparent pr-10 text-[15px] outline-none disabled:text-gray-400 [&::-webkit-calendar-picker-indicator]:opacity-0'
