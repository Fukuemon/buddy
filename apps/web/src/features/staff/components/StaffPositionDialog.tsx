import { InputDialog } from '@buddy/ui'
import { useState } from 'react'

import type { Position, StaffDetail } from '#/api/types'

import { addedPolicyNames } from '../lib/format'
import { sortByName } from './StaffFormFields'

export type StaffPositionDialogProps = {
  staff: StaffDetail
  /** 読み終えるまでは undefined にする。 */
  positions?: readonly Position[]
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (positionId: Position['id']) => void
  onClose: () => void
}

/**
 * 職員の役職を変える入力のダイアログ。今の役職を選んで始め、違う役職を選ぶと変えられる。
 * 役職を変えると権限が新しい役職のものに置き換わり、個別に足した権限が消えるので、主ボタンを危険な操作の色にする。
 */
export const StaffPositionDialog = ({
  staff,
  positions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: StaffPositionDialogProps) => {
  const [selected, setSelected] = useState(staff.position.id)
  const added = addedPolicyNames(
    staff,
    positions?.find((p) => p.id === staff.position.id),
  )
  return (
    <InputDialog
      busyLabel="変えています"
      canSubmit={positions !== undefined && selected !== staff.position.id}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'staff-position-error' }
      }
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={() => onSubmit(selected)}
      submitLabel="役職を変える"
      submitVariant="destructive"
      testIdPrefix="staff-position"
      title="役職を変える"
    >
      <fieldset className="flex flex-col gap-1" data-testid="staff-position-options">
        <legend className="mb-1 text-label">役職</legend>
        {sortByName(positions)?.map((position) => (
          <label
            className="flex min-h-11 cursor-pointer items-center gap-2 text-body"
            key={position.id}
          >
            <input
              checked={selected === position.id}
              data-testid={`staff-position-option-${position.id}`}
              disabled={isSubmitting}
              name="position"
              onChange={() => setSelected(position.id)}
              type="radio"
              value={position.id}
            />
            {position.name}
            {position.id === staff.position.id && '（今の役職）'}
          </label>
        ))}
      </fieldset>
      <p
        className="border-l-4 border-warning bg-warning-surface px-3 py-2 text-body"
        data-testid="staff-position-note"
      >
        {`役職を変えると、${staff.username} の権限は全て、新しい役職に決まっている権限に置き換わります。`}
        {added.length > 0 && `個別に足した権限（${added.join('、')}）は消えます。`}
      </p>
    </InputDialog>
  )
}
