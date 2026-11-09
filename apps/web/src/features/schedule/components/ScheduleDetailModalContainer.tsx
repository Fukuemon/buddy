import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Schedule } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { getCalendarRange } from '../lib/calendarRange'
import { toDateKey } from '../lib/dateTime'
import {
  SCHEDULE_NOT_FOUND_MESSAGE,
  scheduleDeleteErrorMessage,
  scheduleLoadErrorMessage,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import { canEditScheduleOf } from '../lib/schedulePermission'
import { canChangeSchedule, canDeleteSchedule } from '../lib/scheduleWritable'
import {
  facilityQueryOptions,
  patientListQueryOptions,
  scheduleListQueryOptions,
  scheduleQueryOptions,
  staffListQueryOptions,
  useCancelSchedule,
  useDeleteSchedule,
} from '../queries'
import { pickCalendarSearch, resolveCalendarView } from '../schema/scheduleSearch'
import { ScheduleCancelDialog } from './ScheduleCancelDialog'
import { ScheduleDeleteDialog } from './ScheduleDeleteDialog'
import { ScheduleDetailModal } from './ScheduleDetailModal'

/**
 * 予定を 1 件取り、詳細のモーダルに出す。閉じるとカレンダーに戻る。
 * ログインした職員が予定の職員の予定を編集できないときは、編集とキャンセルのボタンを出さない。
 * キャンセルのボタンは、理由を入れるダイアログを開き、開いたときの予定の etag でキャンセルする。キャンセルするとカレンダーに戻る。
 * 削除のボタンは、予定を buddy で管理する事業所の、開始の日が今日以降の予定にだけ出し（canDeleteSchedule）、確認のダイアログの後に削除してカレンダーに戻る。
 * 職員の一覧を読み終えるまでは予定の職員のチームが分からないので、チームを対象にする権限では編集のボタンを出さない。
 *
 * Google カレンダーを予定の正本にする事業所（google_primary）の予定には 1 件の取得が無いので、カレンダーの search params の期間の
 * 予定を職員で絞らずに読み、確認が必要な予定と合わせた中から引く。予定の正本を切り替えている間（一覧の cutover）と、
 * buddy の繰り返しの規則に写せない予定（recurrence_unsupported）には、編集とキャンセルのボタンを出さない（canChangeSchedule）。
 */
export const ScheduleDetailModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const search = useSearch({ from: '/schedule' })
  const calendarSearch = pickCalendarSearch(search)
  const close = () => navigate({ to: '/schedule', search: calendarSearch })
  const { api, facilityId, viewer } = useBuddyApi()
  const [openedAt] = useState(() => new Date())
  const today = toDateKey(openedAt)
  // キャンセルのダイアログを開いた時点の予定の etag。開いていなければ undefined である
  const [cancelETag, setCancelETag] = useState<string | null>()
  const cancelSchedule = useCancelSchedule(scheduleId)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const deleteSchedule = useDeleteSchedule(scheduleId, close)

  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  const sourceMode = facilityQuery.data?.sourceMode
  const scheduleQuery = useQuery({
    ...scheduleQueryOptions(api, facilityId, scheduleId),
    enabled: sourceMode === 'buddy_primary',
  })
  const listQuery = useQuery({
    ...scheduleListQueryOptions(api, facilityId, {
      ...getCalendarRange(resolveCalendarView(search.view), search.date ?? today),
      includeCancelled: search.cancelled,
    }),
    enabled: sourceMode === 'google_primary',
  })
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const activeQuery = sourceMode === 'google_primary' ? listQuery : scheduleQuery
  const error = facilityQuery.isError ? facilityQuery.error : activeQuery.error
  const listed = listQuery.data
  const schedule =
    sourceMode === 'google_primary'
      ? [...(listed?.schedules ?? []), ...(listed?.needsReview ?? [])].find(
          (s) => s.id === scheduleId,
        )
      : scheduleQuery.data
  if (
    schedule === undefined &&
    error === null &&
    (sourceMode === undefined || !activeQuery.isSuccess)
  ) {
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <Loading />
      </Modal>
    )
  }
  if (schedule === undefined) {
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <p className="p-5 text-danger" role="alert">
          {error === null ? SCHEDULE_NOT_FOUND_MESSAGE : scheduleLoadErrorMessage(error)}
        </p>
      </Modal>
    )
  }

  const staff = staffQuery.data?.find((s) => s.id === schedule.staffId)
  const cutover = sourceMode === 'google_primary' ? (listed?.cutover ?? null) : null
  const isEditor = canEditScheduleOf(viewer, { id: schedule.staffId, teamId: staff?.teamId ?? '' })
  const canEdit = isEditor && canChangeSchedule(schedule, cutover)
  const canDelete =
    isEditor &&
    sourceMode !== undefined &&
    canDeleteSchedule(schedule, sourceMode, cutover, openedAt)
  return (
    <>
      <ScheduleDetailModal
        onCancelSchedule={
          canEdit
            ? () => {
                cancelSchedule.reset()
                setCancelETag(schedule.etag ?? null)
              }
            : undefined
        }
        onClose={close}
        onDeleteSchedule={
          canDelete
            ? () => {
                deleteSchedule.reset()
                setIsDeleteOpen(true)
              }
            : undefined
        }
        onChangeRecurrence={
          schedule.recurrence === undefined
            ? undefined
            : () =>
                navigate({
                  to: '/schedule/$scheduleId/recurrence',
                  params: { scheduleId },
                  search: calendarSearch,
                })
        }
        onEdit={
          canEdit
            ? () =>
                navigate({
                  to: '/schedule/$scheduleId/edit',
                  params: { scheduleId },
                  search: calendarSearch,
                })
            : undefined
        }
        patient={patientsQuery.data?.find((patient) => patient.id === schedule.visit?.patientId)}
        schedule={schedule}
        staff={staff}
      />
      {cancelETag !== undefined && (
        <ScheduleCancelDialog
          errorMessage={
            cancelSchedule.isError
              ? scheduleSubmitErrorMessage(cancelSchedule.error, 'キャンセル')
              : undefined
          }
          isSubmitting={cancelSchedule.isPending}
          onCancel={() => setCancelETag(undefined)}
          onSubmit={async (reason) => {
            await cancelSchedule.mutateAsync({ reason, etag: cancelETag })
            await close()
          }}
          schedule={schedule}
        />
      )}
      {isDeleteOpen && (
        <ScheduleDeleteDialog
          errorMessage={
            deleteSchedule.isError ? scheduleDeleteErrorMessage(deleteSchedule.error) : undefined
          }
          isSubmitting={deleteSchedule.isPending}
          onCancel={() => setIsDeleteOpen(false)}
          onSubmit={() => deleteSchedule.mutate()}
          schedule={schedule}
        />
      )}
    </>
  )
}
