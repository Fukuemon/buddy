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

/** 区別の色の、テーマの段のクラス名。Tailwind が読めるように、名前を全て書く。 */
const DOT_COLOR_CLASS_NAMES = [
  'bg-categorical-1',
  'bg-categorical-2',
  'bg-categorical-3',
  'bg-categorical-4',
  'bg-categorical-5',
  'bg-categorical-6',
  'bg-categorical-7',
  'bg-categorical-8',
  'bg-categorical-9',
  'bg-categorical-10',
] as const

export type DotLabelProps = {
  /** 区別の色の番号（0 から）。負の値は、色の付かない点にする。 */
  colorIndex: number
  children: ReactNode
}

/** 名前の前に小さい色の点を置く。色だけで区別させないので、点は読み上げず、名前を必ず並べる。 */
export const DotLabel = ({ colorIndex, children }: DotLabelProps) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span
      aria-hidden
      className={clsx(
        'size-2 shrink-0 rounded-full',
        colorIndex < 0
          ? 'bg-text-secondary'
          : DOT_COLOR_CLASS_NAMES[colorIndex % DOT_COLOR_CLASS_NAMES.length],
      )}
    />
    {children}
  </span>
)
