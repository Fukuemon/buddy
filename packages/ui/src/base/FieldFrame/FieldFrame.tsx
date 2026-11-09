import { clsx } from 'clsx'
import type { MouseEvent, ReactNode } from 'react'

import { fieldBoxClassName } from './fieldClassName'

type FieldFrameProps = {
  htmlFor: string
  label: string
  icon?: ReactNode
  error?: string
  /** エラーの文の要素の id。中の入力欄の aria-describedby に同じ値を渡す。 */
  errorId: string
  isWide?: boolean
  /** true なら、見出しを読み上げだけに残して見せず、枠の高さを 44px にする。見出しを欄の外に置くときに使う。 */
  isLabelHidden?: boolean
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
  isLabelHidden = false,
  children,
}: FieldFrameProps) => (
  <div className={clsx('font-normal', isWide ? 'w-full' : 'w-80')}>
    <label
      className={clsx(
        'relative flex cursor-pointer flex-col justify-center px-4 transition duration-100 has-[:disabled]:cursor-default',
        isLabelHidden ? 'h-11' : 'h-14',
        fieldBoxClassName,
        'focus-within:bg-primary-surface',
      )}
      htmlFor={htmlFor}
    >
      <span
        className={
          isLabelHidden ? 'sr-only' : 'pointer-events-none text-caption text-text-secondary'
        }
      >
        {label}
      </span>
      {children}
      {icon !== undefined && (
        <span className="pointer-events-none absolute inset-y-0 right-1.5 my-auto grid size-10 place-items-center">
          {icon}
        </span>
      )}
    </label>
    {error !== undefined && (
      <span className="mt-1 block text-caption text-danger" id={errorId}>
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

/**
 * 日付と時刻の入力欄の onClick に渡し、ブラウザのピッカーを開く。
 * 右のアイコンは飾りで、ブラウザのピッカーのボタンは隠しているため、枠のどこを押しても開くようにする。
 * showPicker を持たないブラウザと、開けない状態（無効、iframe の制限）では何もしない。
 */
export const showPickerOnClick = (event: MouseEvent<HTMLInputElement>) => {
  const input = event.currentTarget
  if (input.disabled || input.readOnly || typeof input.showPicker !== 'function') return
  try {
    input.showPicker()
  } catch {
    // 利用者の操作の外か、別のオリジンの iframe の中で呼ぶと NotAllowedError になる。入力欄はそのまま使える。
  }
}
