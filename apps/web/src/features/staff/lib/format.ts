import type {
  Policy,
  Position,
  StaffAssignments,
  StaffDetail,
  StaffPolicy,
  StaffRecord,
} from '#/api/types'

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

/** API の日付（YYYY-MM-DD）を `2027/04/01` の形にする。 */
export const formatDate = (date: string) => date.replaceAll('-', '/')

/** 状態の印の文言。休職は戻る予定の日を、退職は退職にした日を添える。 */
export const statusLabel = (
  staff: Pick<StaffRecord, 'status' | 'leave_return_date' | 'retired_at'>,
) => {
  if (staff.status === 'on_leave') {
    return staff.leave_return_date === null
      ? '休職'
      : `休職（${formatDate(staff.leave_return_date)} に戻る予定）`
  }
  if (staff.status === 'retired' && staff.retired_at !== null)
    return `退職（${formatDateTimeAsDate(staff.retired_at)}）`
  return staff.status === 'retired' ? '退職' : '有効'
}

/** 残る単発の予定 1 件の、`2026/11/02 09:00〜10:00` の形の日時。 */
export const formatRemainingSchedule = (schedule: StaffAssignments['schedules'][number]) =>
  `${formatDate(schedule.date)} ${schedule.start_time}〜${schedule.end_time}`

/** 残る繰り返しの予定 1 件の、最初の回の日付、終了日、時間。 */
export const formatRemainingRecurring = (
  recurring: StaffAssignments['recurring_schedules'][number],
) =>
  recurring.end_date === null
    ? `${formatDate(recurring.date)} から 終了日なし、${recurring.start_time}〜${recurring.end_time}`
    : `${formatDate(recurring.date)} から ${formatDate(recurring.end_date)} まで、${recurring.start_time}〜${recurring.end_time}`

/** 残る予定、繰り返しの予定、担当の利用者が 1 つも無いか。 */
export const hasNoAssignments = (assignments: StaffAssignments) =>
  assignments.schedules.length === 0 &&
  assignments.recurring_schedules.length === 0 &&
  assignments.patients.length === 0

/** 在籍の枠の文。休職は休職にした日と戻る予定の日を、退職は退職にした日を入れる。 */
export const employmentText = (
  staff: Pick<StaffRecord, 'status' | 'leave_started_at' | 'leave_return_date' | 'retired_at'>,
) => {
  if (staff.status === 'on_leave') {
    const since =
      staff.leave_started_at === null ? '' : `${formatDateTimeAsDate(staff.leave_started_at)} から`
    return staff.leave_return_date === null
      ? `${since}休職です。`
      : `${since}休職です。戻る予定の日は ${formatDate(staff.leave_return_date)} です。この日に自動では戻りません。`
  }
  if (staff.status === 'retired') {
    const on = staff.retired_at === null ? '' : `${formatDateTimeAsDate(staff.retired_at)} に`
    return `${on}退職にしました。退職は戻せません。名前、所属、役職は、過去の予定と照合の結果のために残しています。`
  }
  return '有効です。ログインして、予定を使えます。'
}

/**
 * 権限の対象の名前を「、」でつなぐ。職員を対象にする権限は職員の名前を、チームを対象にする権限はチームの名前を出す。
 * 対象を指定しない権限は「なし」にする。名前を引けない ID は、ID のまま出す。
 */
export const policyTargetText = (
  policy: Pick<StaffPolicy, 'target_user_ids' | 'target_team_ids'>,
  names: ReadonlyMap<string, string>,
) => {
  const ids = [...policy.target_user_ids, ...policy.target_team_ids]
  return ids.length === 0 ? 'なし' : ids.map((id) => names.get(id) ?? id).join('、')
}

/** 職員の権限のうち、役職のデフォルトの権限に無い、職員ごとに足した権限の名前。 */
export const addedPolicyNames = (staff: StaffDetail, position: Position | undefined) => {
  const defaults = new Set(position?.policies.map((p) => p.id))
  return staff.policies.filter((p) => !defaults.has(p.policy_id)).map((p) => p.name)
}

/** 権限が対象に職員を取るか、チームを取るか。対象を指定しない権限は undefined にする。 */
export const policyTargetKind = (policy: Pick<Policy, 'code' | 'needs_target'>) => {
  if (!policy.needs_target) return undefined
  return policy.code.startsWith('schedule.team.') ? 'team' : 'user'
}

/** 権限の数。権限は予定の API のマイグレーションが入れる 8 つで、事業所ごとには持たない。 */
export const POLICY_COUNT = 8
