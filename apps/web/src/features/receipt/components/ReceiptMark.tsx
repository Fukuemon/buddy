import { clsx } from 'clsx'

import ErrorIcon from '#/assets/icons/error.svg?react'
import WarningIcon from '#/assets/icons/warning.svg?react'

import type { Severity } from '../lib/reportCells'

/**
 * 判定の重さごとの、名前、アイコン、面の色、アイコンの色。
 * 重さを色だけで伝えないよう、形の違うアイコンと名前を色に重ねる。
 */
export const MARKS = {
  mismatch: {
    label: '不一致',
    meaning: '規則に合わない',
    Icon: ErrorIcon,
    surface: 'bg-danger-surface',
    icon: 'text-danger',
  },
  note: {
    label: '注意',
    meaning: '範囲の中だが予定と違う',
    Icon: WarningIcon,
    surface: 'bg-warning-surface',
    icon: 'text-warning',
  },
} as const satisfies Record<Severity, object>

/** 重さのアイコン。名前と並べて出すので、読み上げない。 */
export const MarkIcon = ({ severity }: { severity: Severity }) => {
  const { Icon, icon } = MARKS[severity]
  return (
    <Icon
      aria-hidden
      className={clsx('size-5 shrink-0', icon)}
      data-testid={`receipt-mark-${severity}`}
    />
  )
}

/** 結果の表の上に出す、2 つの重さのアイコンの意味。 */
export const ReceiptMarkLegend = () => (
  <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-dense" data-testid="receipt-mark-legend">
    {(['mismatch', 'note'] as const).map((severity) => (
      <li className="flex items-center gap-1" key={severity}>
        <MarkIcon severity={severity} />
        {MARKS[severity].label}: {MARKS[severity].meaning}
      </li>
    ))}
  </ul>
)
