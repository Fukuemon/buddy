import type { StaffAssignments, StaffDetail } from '#/api/types'

import { hasNoAssignments } from '../lib/format'
import { StaffAssignmentList } from './StaffAssignmentList'
import { StaffDialogFrame } from './StaffDialogFrame'

export type StaffRetireDialogProps = {
  staff: StaffDetail
  /** 今日以降に残る予定と担当の利用者。読み終えるまでは undefined にする。 */
  assignments?: StaffAssignments
  /** 残る予定と担当の利用者を読めなかったときの文。 */
  assignmentsError?: string
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/**
 * 職員を退職にする前に、戻せないことと、今日以降に残る予定と担当の利用者を示すダイアログ。
 * 残るものが無いと読み終えたときだけ、退職にするを押せる。残るものがあれば、退職にできないことをタイトルで示す。
 */
export const StaffRetireDialog = ({
  staff,
  assignments,
  assignmentsError,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: StaffRetireDialogProps) => {
  const refused = assignments !== undefined && !hasNoAssignments(assignments)
  return (
    <StaffDialogFrame
      busyLabel="退職にしています"
      canSubmit={assignments !== undefined && !refused}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={onSubmit}
      role="alertdialog"
      submitLabel="退職にする"
      submitVariant="destructive"
      testIdPrefix="staff-retire"
      title={
        refused ? `${staff.username} を退職にできません` : `${staff.username} を退職にしますか`
      }
    >
      <p className="text-body">
        {`退職は戻せません。メールアドレスと電話番号を消し、${staff.username} はログインできなくなります。名前、所属、役職は、過去の予定と照合の結果のために残ります。同じ人を再び雇うときは、新しい職員として登録します。`}
      </p>
      <StaffAssignmentList
        assignments={assignments}
        errorMessage={assignmentsError}
        kind="retire"
      />
    </StaffDialogFrame>
  )
}
