import { clsx } from 'clsx'
import type { ComponentPropsWithRef, MouseEvent } from 'react'

/**
 * ボタンの見た目の種類。danger は、確認のダイアログ（何が失われるかを示して確定する入力のダイアログを含む）でデータを失う操作を確定するボタンで、赤い面にする。
 * destructive は、データを失う操作の確認のダイアログを開く起点のボタンで、赤い文字にする。
 */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'danger'
/** ボタンの高さ。S は 40px（押せる領域は 44px）、M は 48px、L は 56px。 */
export type ButtonSize = 'S' | 'M' | 'L'

/** ボタンの見た目の指定。isWide は親の幅いっぱいに広げる。 */
export type ButtonStyleOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  isWide?: boolean
}

const variantClassName: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse',
  secondary: 'bg-surface text-primary ring-1 ring-border-field ring-inset',
  destructive: 'bg-surface text-danger ring-1 ring-border-field ring-inset',
  danger: 'bg-danger text-text-inverse',
}

const sizeClassName: Record<ButtonSize, string> = {
  S: 'h-10 min-w-11 rounded-8 px-4 after:absolute after:inset-x-0 after:-inset-y-0.5',
  M: 'h-12 rounded-8 px-5',
  L: 'h-14 rounded-8 px-6',
}

/**
 * Button と同じ見た目のクラス名を返す。Link のように button でない要素をボタンの見た目にするときに使う。
 * 無効の見た目は `aria-disabled="true"` の要素に付く。
 */
export const buttonClassName = ({
  variant = 'primary',
  size = 'M',
  isWide = false,
}: ButtonStyleOptions = {}) =>
  clsx(
    'relative inline-flex cursor-pointer items-center justify-center text-label transition duration-100 ease-in',
    'focus-visible:focus-ring',
    'not-aria-disabled:hover:underline not-aria-disabled:active:scale-[0.98]',
    'aria-disabled:cursor-not-allowed aria-disabled:bg-surface-disabled aria-disabled:text-text-disabled aria-disabled:ring-0',
    variantClassName[variant],
    sizeClassName[size],
    isWide && 'w-full',
  )

export type ButtonProps = ComponentPropsWithRef<'button'> &
  ButtonStyleOptions & {
    /** true の間は子の上に回転するインジケーターを重ね、クリックを無視する。子の文はボタンの名前として残す。 */
    isLoading?: boolean
  }

/**
 * 操作のボタン。type のデフォルトは button である。
 * disabled は `aria-disabled` で表し、フォーカスを受けたまま、クリックと送信を止める。
 */
export const Button = ({
  variant,
  size,
  isWide,
  isLoading = false,
  className,
  children,
  onClick,
  type = 'button',
  disabled = false,
  ...props
}: ButtonProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      aria-disabled={disabled || undefined}
      className={clsx(buttonClassName({ variant, size, isWide }), className)}
      onClick={handleClick}
      type={type}
    >
      <span className={clsx(isLoading && 'opacity-0')}>{children}</span>
      {isLoading && (
        <span
          aria-hidden
          className="absolute size-5 animate-spin rounded-full border-3 border-surface-disabled border-t-text-secondary"
        />
      )}
    </button>
  )
}
