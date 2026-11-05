import { isActiveStaffRecord } from '#/api/activeStaff'
import type { PatientRecord, PatientSchedules, ServiceCodeRecord, StaffRecord } from '#/api/types'

/** 事業所の現地のタイムゾーン。予定の API の日付と同じく、事業所は日本にあるものとする。 */
const FACILITY_TIME_ZONE = 'Asia/Tokyo'

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: FACILITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** ISO 8601 の時刻を、事業所の現地の日付の `2026/09/30` の形にする。 */
export const formatDateTimeAsDate = (dateTime: string) => dateFormat.format(new Date(dateTime))

/** API の日付（YYYY-MM-DD）を `2026/11/02` の形にする。 */
const formatDate = (date: string) => date.replaceAll('-', '/')

/** 利用の終了の状態の印の文言。利用中なら undefined を返す。 */
export const endedLabel = (patient: Pick<PatientRecord, 'ended_at'>) =>
  patient.ended_at === null ? undefined : `利用の終了（${formatDateTimeAsDate(patient.ended_at)}）`

/** 一覧の利用の終了にした日の列の文言。 */
export const endedOnText = (endedAt: string) => `${formatDateTimeAsDate(endedAt)} に利用の終了`

/** サービスの選択肢と詳細の、`訪看I2（20〜29 分）` の形の文言。 */
export const serviceCodeLabel = (code: ServiceCodeRecord) =>
  `${code.code}（${code.service_time_range_start}〜${code.service_time_range_end} 分）`

/** 職員の在籍の状態の文言。有効なら undefined を返す。 */
const staffStatusText = (status: StaffRecord['status'] | undefined) =>
  status === 'on_leave' ? '休職' : status === 'retired' ? '退職' : undefined

/**
 * 担当の職員の名前。休職か退職なら、`小野 拓海（休職）` のように状態を括弧で付ける。
 * staff に担当の職員がいなければ、名前だけを返す。
 */
export const assignedStaffLabel = (
  patient: Pick<PatientRecord, 'assigned_staff_id' | 'assigned_staff_name'>,
  staffList: readonly StaffRecord[] | undefined,
) => {
  const status = staffStatusText(staffList?.find((s) => s.id === patient.assigned_staff_id)?.status)
  return status === undefined
    ? patient.assigned_staff_name
    : `${patient.assigned_staff_name}（${status}）`
}

/**
 * 編集の担当の職員の選択肢。有効で訪問する職員を名前の順に並べ、今の担当が休職か退職か訪問しない職員なら、
 * 今の担当のまま保存できるよう `小野 拓海（休職。今の担当）` の形で先頭に足す。
 */
export const editStaffOptions = (
  patient: Pick<PatientRecord, 'assigned_staff_id' | 'assigned_staff_name'>,
  staffList: readonly StaffRecord[],
) => {
  const current = staffList.find((s) => s.id === patient.assigned_staff_id)
  const status =
    staffStatusText(current?.status) ?? (current?.visits === false ? '訪問しない' : undefined)
  return [
    ...(status === undefined
      ? []
      : [
          {
            id: patient.assigned_staff_id,
            label: `${patient.assigned_staff_name}（${status}。今の担当）`,
          },
        ]),
    ...activeStaffOptions(staffList).map((s) => ({ id: s.id, label: s.username })),
  ]
}

/** 担当に選べる、有効で訪問する職員を、名前の順に返す。訪問しない職員は担当にできない（ADR-0014）。 */
export const activeStaffOptions = (staff: readonly StaffRecord[]) =>
  staff.filter(isActiveStaffRecord).sort((a, b) => a.username.localeCompare(b.username, 'ja'))

/** 残る単発の予定 1 件の、`2026/11/02 09:00〜09:29` の形の日時。 */
export const formatRemainingSchedule = (schedule: PatientSchedules['schedules'][number]) =>
  `${formatDate(schedule.date)} ${schedule.start_time}〜${schedule.end_time}`

/** 残る繰り返しの予定 1 件の、最初の回の日付、終了日、時間。職員の詳細の残る繰り返しの予定と同じ形にする。 */
export const formatRemainingRecurring = (
  recurring: PatientSchedules['recurring_schedules'][number],
) =>
  recurring.end_date === null
    ? `${formatDate(recurring.date)} から 終了日なし、${recurring.start_time}〜${recurring.end_time}`
    : `${formatDate(recurring.date)} から ${formatDate(recurring.end_date)} まで、${recurring.start_time}〜${recurring.end_time}`

/** 残る予定と繰り返しの予定が 1 つも無いか。 */
export const hasNoSchedules = (schedules: PatientSchedules) =>
  schedules.schedules.length === 0 && schedules.recurring_schedules.length === 0
