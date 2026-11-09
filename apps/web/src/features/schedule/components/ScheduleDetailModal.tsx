import type { Patient, Schedule, Staff } from '#/api/types'
import { ActionMenu, Button, HelpToggle, Modal, StatusBadge } from '@buddy/ui'
import { useId } from 'react'

import {
  SCHEDULE_CATEGORY_LABEL,
  SCHEDULE_KIND_LABEL,
  SCHEDULE_REVIEW_REASON_LABEL,
} from '../constants/scheduleLabels'
import { formatDateTimeRange, toTokyoDateKey } from '../lib/dateTime'
import { recurringRuleLabel } from '../lib/recurringRuleLabel'
import { reviewFixMessage } from '../lib/reviewFix'

export type ScheduleDetailModalProps = {
  schedule: Schedule
  staff?: Staff
  patient?: Patient
  /** 編集の画面へ移る。省くと編集のボタンを出さない。編集の権限が無い予定で省く。 */
  onEdit?: () => void
  /**
   * 渡すと、「編集」を、「この予定を編集」（onEdit）と「繰り返しを変更」（onChangeRecurrence）が出るメニューにする。繰り返しの予定のまだ変えていない回（recurrence を持つ予定）で渡す。1 回を置き換えた予定は単発の予定として扱い、渡さない。
   * onEdit を省いたときは使わない。
   */
  onChangeRecurrence?: () => void
  /** キャンセルのダイアログを開く。省くとキャンセルのボタンを出さない。キャンセルできない予定で省く。 */
  onCancelSchedule?: () => void
  /** 削除のダイアログを開く。省くと削除のボタンを出さない。削除できない予定で省く（ADR-0040）。 */
  onDeleteSchedule?: () => void
  onClose: () => void
}

const Row = ({
  label,
  children,
  testId,
}: {
  label: string
  children: React.ReactNode
  testId?: string
}) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2" data-testid={testId}>
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
 * 日時を見出しにし、その下に種類と主訪問者（通常の予定では予定者）を、繰り返しの予定のまだ変えていない回（recurrence を持つ予定）では繰り返しの規則を、訪問の予定では訪問の情報を、最後にメモをセクションに分けて並べる。メモが空なら、メモのセクションを出さない。
 * 見出しと値は、全てのセクションで同じ 1 列の並びにし、値の列の位置をそろえる。
 * 下端の左端に、予定をキャンセルするボタンと予定を削除するボタンをこの順に赤い文字で置き、右に「閉じる」と編集のボタンをこの順にまとめる。
 * onCancelSchedule、onDeleteSchedule、onEdit を省くと、そのボタンを出さない。
 * 予定をキャンセルするボタンと削除するボタンは戻せない操作の起点なので、安全な操作から離して置く。
 * キャンセルした予定は、先頭にキャンセルの理由を出し、下端を出さない。下端が無いので、右上の × で閉じる。
 * Google カレンダーの予定（fromGoogleCalendar）は、先頭に「Google カレンダー」の印と ? のヘルプを出し、buddy で変えると Google カレンダーにも書くことを ? の中で伝える。確認が必要な予定なら理由と直し方も出す。
 */
export const ScheduleDetailModal = ({
  schedule,
  staff,
  patient,
  onEdit,
  onChangeRecurrence,
  onCancelSchedule,
  onDeleteSchedule,
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
                {(onCancelSchedule !== undefined || onDeleteSchedule !== undefined) && (
                  <div className="mr-auto flex flex-wrap gap-2">
                    {onCancelSchedule !== undefined && (
                      <Button
                        data-testid="schedule-detail-cancel-schedule"
                        onClick={onCancelSchedule}
                        variant="destructive"
                      >
                        予定をキャンセル
                      </Button>
                    )}
                    {onDeleteSchedule !== undefined && (
                      <Button
                        data-testid="schedule-detail-delete-schedule"
                        onClick={onDeleteSchedule}
                        variant="destructive"
                      >
                        予定を削除
                      </Button>
                    )}
                  </div>
                )}
                <Button
                  data-testid="schedule-detail-close"
                  onClick={requestClose}
                  variant="secondary"
                >
                  閉じる
                </Button>
                {onEdit !== undefined &&
                  (onChangeRecurrence === undefined ? (
                    <Button data-testid="schedule-detail-edit" onClick={onEdit} variant="secondary">
                      編集
                    </Button>
                  ) : (
                    <ActionMenu
                      data-testid="schedule-detail-edit"
                      items={[
                        {
                          label: 'この予定を編集',
                          onSelect: onEdit,
                          'data-testid': 'schedule-detail-edit-occurrence',
                        },
                        {
                          label: '繰り返しを変更',
                          onSelect: onChangeRecurrence,
                          'data-testid': 'schedule-detail-edit-recurrence',
                        },
                      ]}
                      label="編集"
                      placement="top"
                      triggerLabel="編集"
                    />
                  ))}
              </>
            )
          : undefined
      }
      title="予定の詳細"
    >
      <div className="flex flex-col gap-6 px-5 py-4">
        {schedule.fromGoogleCalendar === true && (
          <div className="relative flex items-center gap-1">
            <StatusBadge data-testid="schedule-detail-google-calendar">
              Google カレンダー
            </StatusBadge>
            <HelpToggle data-testid="schedule-detail-google-calendar-help">
              buddy で変更かキャンセルすると、Google カレンダーにも書きます。
            </HelpToggle>
          </div>
        )}
        {schedule.reviewReason !== undefined && (
          <p
            className="rounded-8 bg-warning-surface px-4 py-3 text-warning"
            data-testid="schedule-detail-review-reason"
          >
            <span className="font-bold">確認が必要な予定です。</span>
            {SCHEDULE_REVIEW_REASON_LABEL[schedule.reviewReason]}。
            {reviewFixMessage(schedule.reviewReason)}
          </p>
        )}
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
            <Row label={schedule.kind === 'visit' ? '主訪問者' : '予定者'}>
              {staff?.name ?? '職員不明'}
            </Row>
            {schedule.recurrence !== undefined && (
              <Row label="繰り返し" testId="schedule-detail-recurrence">
                {recurringRuleLabel(
                  schedule.recurrence.rule,
                  toTokyoDateKey(new Date(schedule.startsAt)),
                )}
              </Row>
            )}
          </dl>
        </section>
        {schedule.visit !== undefined && (
          <section aria-labelledby={visitHeadingId} data-testid="schedule-detail-visit">
            <SectionHeading id={visitHeadingId}>訪問の情報</SectionHeading>
            <dl data-testid="schedule-detail-visit-fields">
              <Row label="利用者">{patient?.name ?? '利用者不明'}</Row>
              <Row label="サービスコード">{schedule.visit.serviceCode}</Row>
              <Row label="訪問の区分">
                {schedule.visit.categories.length > 0
                  ? schedule.visit.categories
                      .map((category) => SCHEDULE_CATEGORY_LABEL[category])
                      .join('、')
                  : '通常'}
              </Row>
            </dl>
          </section>
        )}
        {schedule.description !== '' && (
          <section aria-labelledby={memoHeadingId} data-testid="schedule-detail-memo">
            <SectionHeading id={memoHeadingId}>メモ</SectionHeading>
            <p className="whitespace-pre-wrap py-2">{schedule.description}</p>
          </section>
        )}
      </div>
    </Modal>
  )
}
