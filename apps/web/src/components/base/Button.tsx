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
  primary:
    'bg-action-main text-gray-0 shadow-[inset_0_-2px_0_0_rgb(0_0_0/16%),0_2px_4px_0_rgb(9_9_11/4%)]',
  secondary: 'bg-gray-0 text-action-main ring-1 ring-gray-200 ring-inset shadow-sm',
  destructive: 'bg-gray-0 text-text-critical ring-1 ring-gray-200 ring-inset shadow-sm',
}

const sizeClassName: Record<ButtonSize, string> = {
  S: 'h-10 rounded-xl px-4',
  M: 'h-12 rounded-[15px] px-5',
  L: 'h-14 rounded-[15px] px-6',
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
    'relative inline-flex cursor-pointer items-center justify-center text-[15px] font-bold tracking-[0.04em] transition duration-100 ease-in',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-main',
    'active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:ring-0',
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
        <span className="size-5 animate-spin rounded-full border-3 border-gray-100 border-t-gray-500" />
      ) : (
        children
      )}
    </button>
  )
}
