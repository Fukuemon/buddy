import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef, MouseEvent } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive'
export type ButtonSize = 'S' | 'M' | 'L'

export type ButtonStyleOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  isWide?: boolean
}

const variantClassName: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse',
  secondary: 'bg-surface text-primary ring-1 ring-border-field ring-inset',
  destructive: 'bg-surface text-danger ring-1 ring-border-field ring-inset',
}

const sizeClassName: Record<ButtonSize, string> = {
  S: 'h-10 rounded-8 px-4',
  M: 'h-12 rounded-8 px-5',
  L: 'h-14 rounded-8 px-6',
}

/**
 * Button と同じ見た目のクラス名を返す。Link のように button でない要素をボタンの見た目にするときに使う。
 */
export const buttonClassName = ({
  variant = 'primary',
  size = 'M',
  isWide = false,
}: ButtonStyleOptions = {}) =>
  clsx(
    'relative inline-flex cursor-pointer items-center justify-center text-label transition duration-100 ease-in',
    'focus-visible:focus-ring',
    'active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-disabled disabled:text-text-disabled disabled:ring-0',
    variantClassName[variant],
    sizeClassName[size],
    isWide && 'w-full',
  )

export type ButtonProps = ComponentPropsWithoutRef<'button'> &
  ButtonStyleOptions & {
    /** true の間は子の代わりに回転するインジケーターを出し、クリックを無視する。 */
    isLoading?: boolean
  }

/** 操作のボタン。type の既定は button である。 */
export const Button = ({
  variant,
  size,
  isWide,
  isLoading = false,
  className,
  children,
  onClick,
  type = 'button',
  ...props
}: ButtonProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isLoading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      className={clsx(buttonClassName({ variant, size, isWide }), className)}
      onClick={handleClick}
      type={type}
    >
      {isLoading ? (
        <span className="size-5 animate-spin rounded-full border-3 border-surface-disabled border-t-text-secondary" />
      ) : (
        children
      )}
    </button>
  )
}
