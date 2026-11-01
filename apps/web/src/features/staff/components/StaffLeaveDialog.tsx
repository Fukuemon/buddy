import { ConfirmDialog } from '@buddy/ui'
import { useId, useState } from 'react'

import type { StaffAssignments, StaffDetail } from '#/api/types'

import { StaffAssignmentList } from './StaffAssignmentList'
import { staffFieldClassName } from './StaffFormFields'

export type StaffLeaveDialogProps = {
  staff: StaffDetail
  /** 今日以降に残る予定と担当の利用者。読み終えるまでは undefined にする。 */
  assignments?: StaffAssignments
  /** 残る予定と担当の利用者を読めなかったときの文。 */
  assignmentsError?: string
  isSubmitting: boolean
  errorMessage?: string
  /** 戻る予定の日（YYYY-MM-DD）を渡す。空なら null を渡す。 */
  onSubmit: (returnDate: string | null) => void
  onCancel: () => void
}

/**
 * 職員を休職にする前に、休職の影響と、今日以降に残る予定と担当の利用者を示す確認のダイアログ。
 * 休職は復職にすれば戻せるので、確定のボタンを危険な操作の色にしない。残るものを読み終えるまでは押せない。
 */
export const StaffLeaveDialog = ({
  staff,
  assignments,
  assignmentsError,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: StaffLeaveDialogProps) => {
  const dateId = useId()
  const [returnDate, setReturnDate] = useState('')
  return (
    <ConfirmDialog
      busyLabel="休職にしています"
      canSubmit={assignments !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'staff-leave-error' }
      }
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={() => onSubmit(returnDate === '' ? null : returnDate)}
      submitLabel="休職にする"
      testIdPrefix="staff-leave"
      title={`${staff.username} を休職にしますか`}
    >
      <p className="text-body">
        {`休職の間、${staff.username} はログインできず、予定のカレンダーと、予定と利用者の担当の候補に出ません。復職にすると、元どおりログインできます。`}
      </p>
      <StaffAssignmentList assignments={assignments} errorMessage={assignmentsError} kind="leave" />
      <div className="flex flex-col gap-1">
        <label className="text-label" htmlFor={dateId}>
          戻る予定の日（任意）
        </label>
        <input
          aria-describedby={`${dateId}-hint`}
          className={staffFieldClassName}
          data-testid="staff-leave-return-date"
          disabled={isSubmitting}
          id={dateId}
          onChange={(event) => setReturnDate(event.target.value)}
          type="date"
          value={returnDate}
        />
        <span className="text-caption text-text-secondary" id={`${dateId}-hint`}>
          メモとして残します。この日に自動では戻りません。
        </span>
      </div>
    </ConfirmDialog>
  )
}
