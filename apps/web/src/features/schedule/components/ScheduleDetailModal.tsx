import type { Patient, Schedule, Staff } from '#/api/types'
import { Button } from '#/components/base/Button'
import { Modal } from '#/components/base/Modal'

import { SCHEDULE_CATEGORY_LABEL, SCHEDULE_KIND_LABEL } from '../constants/scheduleLabels'
import { toDateKey, toTimeKey } from '../lib/dateTime'

export type ScheduleDetailModalProps = {
  schedule: Schedule
  staff?: Staff
  patient?: Patient
  onEdit: () => void
  onClose: () => void
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 border-b border-gray-100 py-3">
    <dt className="text-sm text-text-secondary">{label}</dt>
    <dd className="whitespace-pre-wrap">{children}</dd>
  </div>
)

/** 予定の詳細をモーダルで出す。 */
export const ScheduleDetailModal = ({
  schedule,
  staff,
  patient,
  onEdit,
  onClose,
}: ScheduleDetailModalProps) => {
  const start = new Date(schedule.startsAt)
  const end = new Date(schedule.endsAt)

  return (
    <Modal
      data-testid="schedule-detail-modal"
      isOpen
      onCloseRequest={onClose}
      stickyFooter={
        <Button data-testid="schedule-detail-edit" onClick={onEdit} variant="secondary">
          編集
        </Button>
      }
      title="予定の詳細"
    >
      <dl className="px-5 py-2">
        <Row label="種類">{SCHEDULE_KIND_LABEL[schedule.kind]}</Row>
        {schedule.kind === 'normal' && <Row label="タイトル">{schedule.title}</Row>}
        <Row label="日時">
          <span data-testid="schedule-detail-datetime">
            {toDateKey(start)} {toTimeKey(start)} - {toTimeKey(end)}
          </span>
        </Row>
        {schedule.visit !== undefined && (
          <>
            <Row label="利用者">{patient?.name ?? '利用者不明'}</Row>
            <Row label="サービスコード">{schedule.visit.serviceCode}</Row>
            <Row label="訪問の種類">
              {schedule.visit.categories.length > 0
                ? schedule.visit.categories
                    .map((category) => SCHEDULE_CATEGORY_LABEL[category])
                    .join('、')
                : '通常'}
            </Row>
          </>
        )}
        <Row label={schedule.kind === 'visit' ? '担当者' : '予定者'}>
          {staff?.name ?? '職員不明'}
        </Row>
        <Row label="メモ">{schedule.description || 'なし'}</Row>
      </dl>
    </Modal>
  )
}
