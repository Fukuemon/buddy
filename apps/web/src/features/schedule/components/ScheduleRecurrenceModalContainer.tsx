import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { Patient, RecurringRule, Schedule, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Button, Loading, Modal } from '@buddy/ui'

import { WEEKDAYS, nextDayPrefix, toTimeKey, toTokyoDateKey } from '../lib/dateTime'
import {
  SCHEDULE_EDIT_FORBIDDEN_MESSAGE,
  SCHEDULE_LOAD_ERROR_MESSAGE,
  isGoogleEventChanged,
  scheduleLoadErrorMessage,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import { newScheduleId } from '../lib/scheduleId'
import { canEditScheduleOf } from '../lib/schedulePermission'
import {
  patientListQueryOptions,
  scheduleQueryOptions,
  staffListQueryOptions,
  useChangeRecurringRule,
} from '../queries'
import { createRecurringRuleChangeSchema, recurringRuleToSend } from '../schema/recurringRuleChange'
import { toRecurringRuleFormValues, type RecurringRuleFormShape } from '../schema/recurringRuleForm'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { RecurringRuleFields } from './RecurringRuleFields'

const TITLE = '繰り返しの変更'
const FORM_ID = 'schedule-recurrence-form'

/** 2 つの規則が、同じ回と終了日を決めるか。 */
const sameRule = (a: RecurringRule, b: RecurringRule) =>
  a.frequency === b.frequency &&
  a.dayOfWeek === b.dayOfWeek &&
  a.dayOfMonth === b.dayOfMonth &&
  a.weekOfMonth === b.weekOfMonth &&
  a.endDate === b.endDate

/** YYYY-MM-DD を `11月16日（月）` の形にする。 */
const formatMonthDay = (date: string) => {
  const day = new Date(Date.parse(`${date}T00:00:00Z`))
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日（${WEEKDAYS[day.getUTCDay()]}）`
}

type RecurrenceFormProps = {
  schedule: Schedule & { recurrence: NonNullable<Schedule['recurrence']> }
  staffList: Staff[]
  patients: Patient[]
  calendarSearch: ScheduleSearch
}

const RecurrenceForm = ({ schedule, staffList, patients, calendarSearch }: RecurrenceFormProps) => {
  const navigate = useNavigate()
  const { api, facilityId } = useBuddyApi()
  // 開いたときの繰り返しに固定する。予定を取り直すと schedule は最新に替わるが、入力は開いたときの規則から作ったままなので、送る規則と 409 の後の比較は開いたときの規則で行う
  const [recurrence] = useState(schedule.recurrence)
  const occurrenceDate = toTokyoDateKey(new Date(schedule.startsAt))
  // 予定の API は今日より前の日から当てないので（ADR-0037）、今日より前の回を開いたときは今日から当てる
  const [today] = useState(() => toTokyoDateKey(new Date()))
  const effectiveDate = occurrenceDate < today ? today : occurrenceDate
  // 開いたときの etag で送る。Google カレンダーで変わっていたら、読み直した最新の予定の etag に置き換える
  const [etag, setETag] = useState(schedule.etag ?? null)
  const [initial] = useState(() => toRecurringRuleFormValues(recurrence.rule, occurrenceDate))
  const form = useForm<RecurringRuleFormShape>({
    defaultValues: { recurrence: initial },
    resolver: zodResolver(createRecurringRuleChangeSchema(initial, effectiveDate)),
  })
  // 送り直しでも同じ ID を送る。google_primary で元の親に書けずに失敗したとき、新しい親を重ねずにやり直すためである
  const [newRecurringId] = useState(() => newScheduleId())
  const changeRule = useChangeRecurringRule(schedule.id)
  const [isGone, setGone] = useState(false)

  const backToDetail = () =>
    navigate({
      to: '/schedule/$scheduleId',
      params: { scheduleId: schedule.id },
      search: calendarSearch,
    })

  const submit = async (values: RecurringRuleFormShape) => {
    try {
      const changed = await changeRule.mutateAsync({
        recurringScheduleId: recurrence.recurringScheduleId,
        change: {
          effectiveDate,
          rule: recurringRuleToSend(values, initial, recurrence.rule),
          id: newRecurringId,
        },
        etag,
      })
      // 開いた回は別の繰り返しの予定の回に替わり、その日に回が無くなることもあるので、詳細ではなくカレンダーへ戻る
      await navigate({
        to: '/schedule',
        search: {
          ...calendarSearch,
          date: changed.date > effectiveDate ? changed.date : effectiveDate,
        },
      })
    } catch (error) {
      if (!isGoogleEventChanged(error)) return
      const latest = await api.schedules.get(facilityId, schedule.id).catch(() => undefined)
      // 開いた回が無くなったか別の繰り返しの予定の回になったときは、etag を取り直せない。規則が変わっていたときは、
      // 開いたときの規則から作った入力のまま送ると、Google カレンダーで変えた規則（終了日など）を知らずに消すので、どちらも開き直させる
      if (
        latest?.recurrence?.recurringScheduleId !== recurrence.recurringScheduleId ||
        !sameRule(latest.recurrence.rule, recurrence.rule)
      ) {
        setGone(true)
        return
      }
      setETag(latest.etag ?? null)
    }
  }

  const start = new Date(schedule.startsAt)
  const end = new Date(schedule.endsAt)
  const staff = staffList.find((s) => s.id === schedule.staffId)
  const patient = patients.find((p) => p.id === schedule.visit?.patientId)
  const summary: [string, string][] = [
    ['時刻', `${toTimeKey(start)}〜${nextDayPrefix(start, end)}${toTimeKey(end)}`],
    ...(schedule.kind === 'visit'
      ? ([['利用者', patient?.name ?? '利用者不明']] as [string, string][])
      : ([['タイトル', schedule.title]] as [string, string][])),
    [schedule.kind === 'visit' ? '主訪問者' : '予定者', staff?.name ?? '職員不明'],
  ]

  return (
    <Modal
      data-testid="schedule-recurrence-modal"
      isDirty={form.formState.isDirty}
      isOpen
      onCloseRequest={backToDetail}
      stickyFooter={(requestClose) => (
        <>
          <Button
            data-testid="schedule-recurrence-cancel"
            onClick={requestClose}
            variant="secondary"
          >
            キャンセル
          </Button>
          <Button
            data-testid="schedule-recurrence-submit"
            disabled={isGone}
            form={FORM_ID}
            isLoading={form.formState.isSubmitting}
            type="submit"
          >
            保存
          </Button>
        </>
      )}
      title={TITLE}
    >
      <form
        className="flex flex-col gap-6 px-5 py-6 desktop:px-6"
        id={FORM_ID}
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <p data-testid="schedule-recurrence-lead">
          {effectiveDate === occurrenceDate
            ? `${formatMonthDay(effectiveDate)}以降の回の繰り返しを変えます。`
            : `今日（${formatMonthDay(effectiveDate)}）以降の回の繰り返しを変えます。今日より前の回は変わりません。`}
          時刻、利用者、職員、内容は変わりません。
        </p>
        <dl
          className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-8 bg-surface-subtle p-4 desktop:grid-cols-[7rem_minmax(0,1fr)] desktop:gap-y-2"
          data-testid="schedule-recurrence-summary"
        >
          {summary.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-text-secondary">{label}</dt>
              <dd className="mb-2 desktop:mb-0">{value}</dd>
            </div>
          ))}
        </dl>
        <RecurringRuleFields baseDate={occurrenceDate} form={form} />
        {changeRule.isError && (
          <p className="text-danger" data-testid="schedule-recurrence-error" role="alert">
            {isGone
              ? 'Google カレンダーで繰り返しの予定が変わっていました。予定のカレンダーから開き直し、最新の繰り返しを確認してください。'
              : scheduleSubmitErrorMessage(changeRule.error, '更新')}
          </p>
        )}
      </form>
    </Modal>
  )
}

/**
 * 繰り返しの予定の回を 1 件取り、その回の日（今日より前の回では今日）以降の回の繰り返しの規則を変えるモーダルを出す（ADR-0037）。予定の詳細の「編集」のメニューの「繰り返しを変更」から開く。
 * 繰り返しと終了の欄だけを出し、時刻、利用者、職員は本文の文字で示して変えさせない。保存するとカレンダーへ戻り、閉じると予定の詳細へ戻る。
 * 編集の権限が無い予定、キャンセルした予定、繰り返しの予定のまだ変えていない回でない予定（単発の予定と、1 回を置き換えた予定）では、欄を出さずに理由を出す。
 * 詳細はこれらの予定にメニューを出さないが、URL を直に開いたときのためである。
 */
export const ScheduleRecurrenceModalContainer = ({
  scheduleId,
}: {
  scheduleId: Schedule['id']
}) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId, viewer } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const schedule = scheduleQuery.data
  const staffList = staffQuery.data
  const patients = patientsQuery.data
  const close = () =>
    navigate({ to: '/schedule/$scheduleId', params: { scheduleId }, search: calendarSearch })
  const message = (text: string, testId?: string, isError = false) => (
    <Modal data-testid={testId} isOpen onCloseRequest={close} title={TITLE}>
      <p className={isError ? 'p-5 text-danger' : 'p-5'} role={isError ? 'alert' : undefined}>
        {text}
      </p>
    </Modal>
  )

  if (schedule === undefined || staffList === undefined || patients === undefined) {
    if (scheduleQuery.isError)
      return message(scheduleLoadErrorMessage(scheduleQuery.error), undefined, true)
    if (staffQuery.isError || patientsQuery.isError) {
      return message(SCHEDULE_LOAD_ERROR_MESSAGE, undefined, true)
    }
    return (
      <Modal isOpen title={TITLE}>
        <Loading />
      </Modal>
    )
  }

  const owner = staffList.find((staff) => staff.id === schedule.staffId)
  if (!canEditScheduleOf(viewer, { id: schedule.staffId, teamId: owner?.teamId ?? '' })) {
    return message(SCHEDULE_EDIT_FORBIDDEN_MESSAGE, 'schedule-recurrence-forbidden')
  }
  if (schedule.cancel !== undefined) {
    return message(
      'キャンセルした予定からは、繰り返しを変えられません。',
      'schedule-recurrence-blocked',
    )
  }
  if (schedule.recurrence === undefined) {
    return message(
      'この予定は繰り返しの予定の回ではないため、繰り返しを変えられません。',
      'schedule-recurrence-blocked',
    )
  }

  return (
    <RecurrenceForm
      calendarSearch={calendarSearch}
      patients={patients}
      schedule={{ ...schedule, recurrence: schedule.recurrence }}
      staffList={staffList}
    />
  )
}
