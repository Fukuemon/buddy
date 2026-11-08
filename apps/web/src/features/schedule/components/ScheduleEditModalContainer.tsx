import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { Patient, Schedule, ScheduleKind, ServiceCodeRecord, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import {
  SCHEDULE_EDIT_FORBIDDEN_MESSAGE,
  SCHEDULE_LOAD_ERROR_MESSAGE,
  isGoogleEventChanged,
  scheduleLoadErrorMessage,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import { toTokyoDateKey } from '../lib/dateTime'
import { canAddVisitInfo } from '../lib/reviewFix'
import { newScheduleId } from '../lib/scheduleId'
import {
  createScheduleFormValues,
  defaultServiceCode,
  toScheduleFormValues,
  toScheduleInput,
} from '../lib/scheduleFormMapper'
import { canEditScheduleOf, editableStaff } from '../lib/schedulePermission'
import {
  patientListQueryOptions,
  scheduleQueryOptions,
  serviceCodeListQueryOptions,
  staffListQueryOptions,
  useChangeRecurringRule,
  useUpdateSchedule,
} from '../queries'
import { createRecurringRuleChangeSchema, recurringRuleToSend } from '../schema/recurringRuleChange'
import { toRecurringRuleFormValues, type RecurringRuleFormShape } from '../schema/recurringRuleForm'
import { createScheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { RecurringRuleFields } from './RecurringRuleFields'
import { ScheduleFormModal, type ScheduleEditScope } from './ScheduleFormModal'
import { ScheduleLatestNotice } from './ScheduleLatestNotice'

const RULE_FORM_ID = 'schedule-rule-form'

type ScheduleEditFormProps = {
  schedule: Schedule
  staffList: Staff[]
  staffCandidates: Staff[]
  patients: Patient[]
  serviceCodes: ServiceCodeRecord[]
  calendarSearch: ScheduleSearch
}

const ScheduleEditForm = ({
  schedule,
  staffList,
  staffCandidates,
  patients,
  serviceCodes,
  calendarSearch,
}: ScheduleEditFormProps) => {
  const navigate = useNavigate()
  const { api, facilityId } = useBuddyApi()
  const updateSchedule = useUpdateSchedule(schedule.id)
  // 編集を開いたときの etag で保存する。Google カレンダーで変わっていたら、読み直した最新の予定の etag に置き換える
  const [etag, setETag] = useState(schedule.etag ?? null)
  const [latest, setLatest] = useState<Schedule>()
  const [schema] = useState(() => createScheduleFormSchema(serviceCodes))
  const [initial] = useState(() => toScheduleFormValues(schedule))
  // 開いたときの予定で決める。編集の途中で読み直した予定が確認の必要な予定でなくなっても、通常に戻せるようにする
  const [kindChangeable] = useState(() => canAddVisitInfo(schedule))
  const form = useForm<ScheduleFormValues>({
    defaultValues: initial,
    resolver: zodResolver(schema),
    // 誤りの欄へのフォーカスは ScheduleForm が移す。react-hook-form は閉じた編集の欄の誤りにフォーカスを移せない
    shouldFocusError: false,
  })

  // 日付、開始時間、職員、メモは残し、ほかは選んだ種類の初期値にする。開いたときの値を defaultValues のまま残し、変更ありかを開いたときの値と比べる
  const changeKind = (kind: ScheduleKind) => {
    const current = form.getValues()
    const kept = {
      scheduleDate: current.scheduleDate,
      startTime: current.startTime,
      staffId: current.staffId,
      description: current.description,
    }
    const next =
      kind === initial.kind
        ? { ...initial, ...kept }
        : {
            ...createScheduleFormValues({
              kind,
              date: current.scheduleDate,
              time: current.startTime,
              staffId: current.staffId,
              serviceCode: defaultServiceCode(serviceCodes),
            }),
            description: current.description,
          }
    form.reset(next, { keepDefaultValues: true })
  }

  const occurrenceDate = toTokyoDateKey(new Date(schedule.startsAt))
  const recurrence = schedule.recurrence
  const [scope, setScope] = useState<ScheduleEditScope>('occurrence')
  const [ruleInitial] = useState(() => toRecurringRuleFormValues(recurrence?.rule, occurrenceDate))
  const ruleForm = useForm<RecurringRuleFormShape>({
    defaultValues: { recurrence: ruleInitial },
    resolver: zodResolver(createRecurringRuleChangeSchema(ruleInitial, occurrenceDate)),
  })
  // 送り直しでも同じ ID を送る。google_primary で元の親に書けずに失敗したとき、新しい親を重ねずにやり直すためである
  const [newRecurringId] = useState(() => newScheduleId())
  const changeRule = useChangeRecurringRule(schedule.id)
  const [isPastOccurrence] = useState(() => occurrenceDate < toTokyoDateKey(new Date()))

  const showLatestIfChanged = async (error: unknown) => {
    if (!isGoogleEventChanged(error)) return
    const current = await api.schedules.get(facilityId, schedule.id).catch(() => undefined)
    if (current === undefined) return
    setLatest(current)
    setETag(current.etag ?? null)
  }

  // 繰り返しの回を保存すると、回は新しい単発の予定に置き換わるので、保存した予定の ID の詳細へ戻る。
  // Google カレンダーの予定の詳細はカレンダーの期間の一覧から引くので、保存した日をカレンダーの日にする
  const backToDetail = (scheduleId: Schedule['id'] = schedule.id, date = calendarSearch.date) =>
    navigate({
      to: '/schedule/$scheduleId',
      params: { scheduleId },
      search: { ...calendarSearch, date },
    })

  const submitRuleChange = async (values: RecurringRuleFormShape) => {
    if (recurrence === undefined) return
    try {
      const changed = await changeRule.mutateAsync({
        recurringScheduleId: recurrence.recurringScheduleId,
        change: {
          effectiveDate: occurrenceDate,
          rule: recurringRuleToSend(values, ruleInitial, recurrence.rule),
          id: newRecurringId,
        },
        etag,
      })
      // 開いた回は別の繰り返しの予定の回に替わり、その日に回が無くなることもあるので、詳細ではなくカレンダーへ戻る
      await navigate({
        to: '/schedule',
        search: {
          ...calendarSearch,
          date: changed.date > occurrenceDate ? changed.date : occurrenceDate,
        },
      })
    } catch (error) {
      await showLatestIfChanged(error)
    }
  }

  const ruleBody = isPastOccurrence ? (
    <p data-testid="schedule-edit-rule-past">
      今日より前の回からは、繰り返しを変えられません。今日以降の回を開いて変えてください。
    </p>
  ) : (
    <form
      className="flex max-w-120 flex-col gap-6"
      id={RULE_FORM_ID}
      noValidate
      onSubmit={ruleForm.handleSubmit(submitRuleChange)}
    >
      <p data-testid="schedule-edit-rule-lead">
        {occurrenceDate} 以降の回の繰り返しだけを変え、時刻、職員、内容は今のままにします。
      </p>
      <RecurringRuleFields form={ruleForm} />
    </form>
  )

  const following = scope === 'following'
  const failed = following ? changeRule : updateSchedule

  return (
    <ScheduleFormModal
      form={form}
      onClose={() => backToDetail()}
      onKindChange={kindChangeable ? changeKind : undefined}
      scope={
        recurrence === undefined
          ? undefined
          : {
              value: scope,
              onChange: setScope,
              following: {
                body: ruleBody,
                formId: RULE_FORM_ID,
                isSubmitting: ruleForm.formState.isSubmitting,
                isDirty: ruleForm.formState.isDirty,
                canSubmit: !isPastOccurrence,
              },
            }
      }
      notice={
        latest === undefined ? undefined : (
          <ScheduleLatestNotice latest={latest} patients={patients} staffList={staffList} />
        )
      }
      onSubmit={async (values) => {
        try {
          const saved = await updateSchedule.mutateAsync({ input: toScheduleInput(values), etag })
          await backToDetail(saved.id, values.scheduleDate)
        } catch (error) {
          await showLatestIfChanged(error)
        }
      }}
      patients={patients}
      serviceCodes={serviceCodes}
      staffCandidates={staffCandidates}
      staffList={staffList}
      submitError={failed.isError ? scheduleSubmitErrorMessage(failed.error, '更新') : undefined}
      submitLabel="保存"
      submitTestId="schedule-edit-submit"
      cancelTestId="schedule-edit-cancel"
      title="予定の編集"
    />
  )
}

/**
 * 予定を 1 件取り、その値を初期値にして編集のフォームを出す。保存すると詳細に戻る。
 * ログインした職員が予定の職員の予定を編集できないときは、フォームを出さずに権限が無いことを出す。
 * 職員の候補は、ログインした職員が予定を編集できる職員に限る。
 * 一度読めた後の読み直しが失敗しても、読めた値でフォームを出したままにし、入力を消さない。
 * Google カレンダーを予定の正本にする事業所（google_primary）でも同じフォームを出し、編集を開いたときに読んだ予定の etag で保存する（ADR-0029）。
 * 開いた後に Google カレンダーで予定が変わっていたら（409 の google_event_changed）、入力を残したまま、フォームの上に最新の予定を出し、
 * etag を最新の予定の etag に置き換える。もう一度保存すると、最新の予定を入力の内容にする。
 * buddy の繰り返しの規則に写せない Google カレンダーの予定（recurrence_unsupported）は、フォームを出さずに変えられないことを出す。
 * タイトルから訪問の情報を読み取れなかった Google カレンダーの予定（canAddVisitInfo）だけ、予定の種類のタブを出し、訪問にして訪問の情報を足せる。
 */
export const ScheduleEditModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId, viewer } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))
  const serviceCodesQuery = useQuery(serviceCodeListQueryOptions(api, facilityId))

  const schedule = scheduleQuery.data
  const staffList = staffQuery.data
  const patients = patientsQuery.data
  const serviceCodes = serviceCodesQuery.data
  if (
    schedule === undefined ||
    staffList === undefined ||
    patients === undefined ||
    serviceCodes === undefined
  ) {
    const failed =
      scheduleQuery.isError ||
      staffQuery.isError ||
      patientsQuery.isError ||
      serviceCodesQuery.isError
    if (!failed) {
      return (
        <Modal isOpen title="予定の編集">
          <Loading />
        </Modal>
      )
    }
    return (
      <Modal
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5 text-danger" role="alert">
          {scheduleQuery.isError
            ? scheduleLoadErrorMessage(scheduleQuery.error)
            : SCHEDULE_LOAD_ERROR_MESSAGE}
        </p>
      </Modal>
    )
  }

  const owner = staffList.find((staff) => staff.id === schedule.staffId)
  if (!canEditScheduleOf(viewer, { id: schedule.staffId, teamId: owner?.teamId ?? '' })) {
    return (
      <Modal
        data-testid="schedule-edit-forbidden"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">{SCHEDULE_EDIT_FORBIDDEN_MESSAGE}</p>
      </Modal>
    )
  }

  if (schedule.reviewReason === 'recurrence_unsupported') {
    return (
      <Modal
        data-testid="schedule-edit-recurrence-unsupported"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">
          この予定の繰り返しの規則は buddy で表せないため、buddy では変更できません。Google
          カレンダーで変更してください。
        </p>
      </Modal>
    )
  }

  if (schedule.cancel !== undefined) {
    return (
      <Modal
        data-testid="schedule-edit-cancelled"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">キャンセルした予定は編集できません。</p>
      </Modal>
    )
  }

  return (
    <ScheduleEditForm
      calendarSearch={calendarSearch}
      patients={patients}
      serviceCodes={serviceCodes}
      schedule={schedule}
      staffCandidates={editableStaff(viewer, staffList)}
      staffList={staffList}
    />
  )
}
