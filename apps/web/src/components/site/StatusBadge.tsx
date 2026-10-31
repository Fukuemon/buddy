import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type StatusBadgeProps = {
  /** warning は注意の状態を注意の面で、muted は終わった状態を薄い面で示す。 */
  tone?: 'default' | 'warning' | 'muted'
  'data-testid'?: string
  children: ReactNode
}

/** 状態を文字で示す印。色だけで状態を伝えない。 */
export const StatusBadge = ({
  tone = 'default',
  'data-testid': testId,
  children,
}: StatusBadgeProps) => (
  <span
    className={clsx(
      'inline-block rounded-full border px-2 py-0.5 text-caption whitespace-nowrap',
      tone === 'warning' && 'border-text bg-warning-surface font-bold',
      tone === 'muted' && 'border-border bg-surface-subtle text-text-secondary',
      tone === 'default' && 'border-border',
    )}
    data-testid={testId}
  >
    {children}
  </span>
)

export type AvatarProps = {
  name: string
  /** true なら薄い面にする。終わった状態の人に使う。 */
  isMuted?: boolean
  size?: 'S' | 'L'
}

/** 名前の先頭の 1 文字を入れた丸。飾りなので読み上げない。 */
export const Avatar = ({ name, isMuted = false, size = 'S' }: AvatarProps) => (
  <span
    aria-hidden
    className={clsx(
      'grid shrink-0 place-items-center rounded-full font-bold',
      size === 'L' ? 'size-12 text-heading-sm' : 'size-8 text-label',
      isMuted ? 'bg-surface-subtle text-text-secondary' : 'bg-primary text-text-inverse',
    )}
  >
    {name.slice(0, 1)}
  </span>
)
