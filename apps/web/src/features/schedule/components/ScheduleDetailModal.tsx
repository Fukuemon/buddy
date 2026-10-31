import type { Patient, Schedule, Staff } from '#/api/types'
import { Button, Modal } from '@buddy/ui'
import { useId } from 'react'

import { SCHEDULE_CATEGORY_LABEL, SCHEDULE_KIND_LABEL } from '../constants/scheduleLabels'
import { formatDateTimeRange } from '../lib/dateTime'

export type ScheduleDetailModalProps = {
  schedule: Schedule
  staff?: Staff
  patient?: Patient
  onEdit: () => void
  onClose: () => void
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2">
    <dt className="text-caption text-text-secondary">{label}</dt>
    <dd className="whitespace-pre-wrap">{children}</dd>
  </div>
)

const SectionHeading = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h3 className="border-b border-border pb-2 text-label" id={id}>
    {children}
  </h3>
)

/**
 * 予定の詳細をモーダルで出す。
 * 日時を見出しにし、その下に種類と担当者を、訪問の予定では訪問の情報を、最後にメモをセクションに分けて並べる。
 * 見出しと値は、全てのセクションで同じ 1 列の並びにし、値の列の位置をそろえる。
 * 下端の右に「閉じる」と編集のボタンをこの順に置く。キャンセルした予定は、先頭にキャンセルの理由を出し、下端を出さない。
 */
export const ScheduleDetailModal = ({
  schedule,
  staff,
  patient,
  onEdit,
  onClose,
}: ScheduleDetailModalProps) => {
  const visitHeadingId = useId()
  const memoHeadingId = useId()
  return (
    <Modal
      data-testid="schedule-detail-modal"
      isOpen
      onCloseRequest={onClose}
      stickyFooter={
        schedule.cancel === undefined
          ? (requestClose) => (
              <>
                <Button
                  data-testid="schedule-detail-close"
                  onClick={requestClose}
                  variant="secondary"
                >
                  閉じる
                </Button>
                <Button data-testid="schedule-detail-edit" onClick={onEdit} variant="secondary">
                  編集
                </Button>
              </>
            )
          : undefined
      }
      title="予定の詳細"
    >
      <div className="flex flex-col gap-6 px-5 py-4">
        {schedule.cancel !== undefined && (
          <p
            className="rounded-8 bg-warning-surface px-4 py-3 text-warning"
            data-testid="schedule-detail-cancel"
          >
            <span className="font-bold">キャンセルした予定です。</span>
            理由: {schedule.cancel.reason || 'なし'}
          </p>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-heading-sm" data-testid="schedule-detail-datetime">
            {formatDateTimeRange(new Date(schedule.startsAt), new Date(schedule.endsAt))}
          </h3>
          <dl>
            <Row label="種類">{SCHEDULE_KIND_LABEL[schedule.kind]}</Row>
            {schedule.kind === 'normal' && <Row label="タイトル">{schedule.title}</Row>}
            <Row label={schedule.kind === 'visit' ? '担当者' : '予定者'}>
              {staff?.name ?? '職員不明'}
            </Row>
          </dl>
        </section>
        {schedule.visit !== undefined && (
          <section aria-labelledby={visitHeadingId} data-testid="schedule-detail-visit">
            <SectionHeading id={visitHeadingId}>訪問の情報</SectionHeading>
            <dl data-testid="schedule-detail-visit-fields">
              <Row label="利用者">{patient?.name ?? '利用者不明'}</Row>
              <Row label="サービスコード">{schedule.visit.serviceCode}</Row>
              <Row label="訪問の種類">
                {schedule.visit.categories.length > 0
                  ? schedule.visit.categories
                      .map((category) => SCHEDULE_CATEGORY_LABEL[category])
                      .join('、')
                  : '通常'}
              </Row>
            </dl>
          </section>
        )}
        <section aria-labelledby={memoHeadingId} data-testid="schedule-detail-memo">
          <SectionHeading id={memoHeadingId}>メモ</SectionHeading>
          <p className="whitespace-pre-wrap py-2">{schedule.description || 'なし'}</p>
        </section>
      </div>
    </Modal>
  )
}
