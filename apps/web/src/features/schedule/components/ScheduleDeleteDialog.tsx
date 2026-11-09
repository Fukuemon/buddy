import { ConfirmDialog } from '@buddy/ui'

import type { Schedule } from '#/api/types'

import { formatDateTimeRange } from '../lib/dateTime'

export type ScheduleDeleteDialogProps = {
  schedule: Schedule
  isSubmitting: boolean
  /** 削除できなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/**
 * 誤って入れた予定を削除する前の確認のダイアログ（ADR-0040）。キャンセルと違い、理由を入れない。
 * 削除は戻せないので、確定のボタンを危険な操作の色にし、予定を取りやめたときはキャンセルを使うことを示す。
 * 閉じる側のボタンは「戻る」にする。「キャンセル」にすると、予定のキャンセルと読み違えやすいためである。
 * 繰り返しの予定のまだ変えていない回（recurrence を持つ予定）では、その回だけを消し、ほかの回は残ることを示す。
 */
export const ScheduleDeleteDialog = ({
  schedule,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: ScheduleDeleteDialogProps) => (
  <ConfirmDialog
    busyLabel="削除しています"
    canSubmit
    cancelLabel="戻る"
    error={
      errorMessage === undefined
        ? undefined
        : { message: errorMessage, testId: 'schedule-delete-error', isBlock: true }
    }
    isSubmitting={isSubmitting}
    onCancel={onCancel}
    onSubmit={onSubmit}
    submitLabel="予定を削除する"
    submitVariant="danger"
    testIdPrefix="schedule-delete"
    title="この予定を削除しますか"
  >
    <p className="text-body" data-testid="schedule-delete-datetime">
      {formatDateTimeRange(new Date(schedule.startsAt), new Date(schedule.endsAt))}
    </p>
    <p className="text-body" data-testid="schedule-delete-description">
      {schedule.recurrence === undefined
        ? '誤って入れた予定を消します。削除した予定はカレンダーに出ず、元に戻せません。予定を取りやめたときは、削除せずにキャンセルしてください。'
        : '繰り返しの予定のうち、この日の回だけを消します。ほかの回は残ります。削除した回は元に戻せません。予定を取りやめたときは、削除せずにキャンセルしてください。'}
    </p>
  </ConfirmDialog>
)
