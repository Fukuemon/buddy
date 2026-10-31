import { clsx } from 'clsx'

import type { StaffRecord } from '#/api/types'

import { statusLabel } from '../lib/format'

export type StaffStatusBadgeProps = {
  staff: Pick<StaffRecord, 'status' | 'leave_return_date' | 'retired_at'>
  'data-testid'?: string
}

/** 職員が有効か、休職か、退職かを示す印。有効は枠だけ、休職は注意の面、退職は薄い面で示す。 */
export const StaffStatusBadge = ({ staff, 'data-testid': testId }: StaffStatusBadgeProps) => (
  <span
    className={clsx(
      'inline-block rounded-full border px-2 py-0.5 text-caption whitespace-nowrap',
      staff.status === 'on_leave' && 'border-text bg-warning-surface font-bold',
      staff.status === 'retired' && 'border-border bg-surface-subtle text-text-secondary',
      staff.status === 'active' && 'border-border',
    )}
    data-testid={testId}
  >
    {statusLabel(staff)}
  </span>
)
