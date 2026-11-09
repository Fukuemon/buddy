import { ConfirmDialog, TextareaField } from '@buddy/ui'
import { useForm, useWatch } from 'react-hook-form'

import type { Schedule } from '#/api/types'

import { formatDateTimeRange } from '../lib/dateTime'

/** キャンセルの理由の上限の文字数。予定の API の上限と同じである。 */
const REASON_MAX_LENGTH = 255

export type ScheduleCancelDialogProps = {
  schedule: Schedule
  isSubmitting: boolean
  /** キャンセルできなかったときの文。 */
  errorMessage?: string
  /** 入れた理由で予定をキャンセルする。理由は前後の空白を除いた値である。 */
  onSubmit: (reason: string) => void
  onCancel: () => void
}

/**
 * 予定をキャンセルする前に、キャンセルの理由を入れる確認のダイアログ。
 * 理由を入れるまで、キャンセルするボタンを押せない。キャンセルは戻せないので、確定のボタンを危険な操作の色にする。
 * 閉じる側のボタンは「戻る」にし、確定の「予定をキャンセルする」と同じ語のボタンを並べない。
 * Google カレンダーの予定（fromGoogleCalendar）は、Google カレンダーから予定を消し、理由を保存しないことを示す（ADR-0029）。
 */
export const ScheduleCancelDialog = ({
  schedule,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: ScheduleCancelDialogProps) => {
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } })
  const reason = useWatch({ control: form.control, name: 'reason' }).trim()
  return (
    <ConfirmDialog
      busyLabel="キャンセルしています"
      cancelLabel="戻る"
      canSubmit={reason.length > 0 && reason.length <= REASON_MAX_LENGTH}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'schedule-cancel-error', isBlock: true }
      }
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={() => onSubmit(reason)}
      submitLabel="予定をキャンセルする"
      submitVariant="danger"
      testIdPrefix="schedule-cancel"
      title="この予定をキャンセルしますか"
    >
      <p className="text-body" data-testid="schedule-cancel-datetime">
        {formatDateTimeRange(new Date(schedule.startsAt), new Date(schedule.endsAt))}
      </p>
      <p className="text-body" data-testid="schedule-cancel-description">
        {schedule.fromGoogleCalendar === true
          ? 'Google カレンダーから予定を消します。キャンセルの理由は、Google カレンダーに書けないので残りません。'
          : 'キャンセルした予定は、キャンセルした予定を出すとカレンダーに残り、理由を見られます。'}
      </p>
      <TextareaField
        control={form.control}
        data-testid="schedule-cancel-reason"
        label="キャンセルの理由"
        name="reason"
        placeholder="例: 利用者の都合で取りやめ"
      />
    </ConfirmDialog>
  )
}
