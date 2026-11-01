import type { PatientRecord, ServiceCodeRecord, StaffRecord } from '#/api/types'

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
  staff: readonly StaffRecord[] | undefined,
) => {
  const status = staffStatusText(staff?.find((s) => s.id === patient.assigned_staff_id)?.status)
  return status === undefined
    ? patient.assigned_staff_name
    : `${patient.assigned_staff_name}（${status}）`
}

/** 担当に選べる有効な職員を、名前の順に返す。 */
export const activeStaffOptions = (staff: readonly StaffRecord[]) =>
  staff
    .filter((s) => s.status === 'active')
    .sort((a, b) => a.username.localeCompare(b.username, 'ja'))
