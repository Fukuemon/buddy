import type {
  Policy,
  Position,
  StaffAssignments,
  StaffDetail,
  StaffPolicy,
  StaffRecord,
} from '#/api/types'
import { formatDateKey, formatFacilityDate, formatTimeRange } from '#/components/dateFormat'

/** ISO 8601 の時刻を、事業所の現地の日付の `2026年9月30日（水）` の形にする。 */
export const formatDateTimeAsDate = formatFacilityDate

/** API の日付（YYYY-MM-DD）を `2027年4月1日（木）` の形にする。 */
export const formatDate = (date: string) => formatDateKey(date)

/** 状態の印の文言。休職は戻る予定の日を、退職は退職にした日を添える。 */
export const statusLabel = (
  staff: Pick<StaffRecord, 'status' | 'leave_return_date' | 'retired_at'>,
) => {
  if (staff.status === 'on_leave') {
    return staff.leave_return_date === null
      ? '休職'
      : `休職（${formatDate(staff.leave_return_date)}に戻る予定）`
  }
  if (staff.status === 'retired' && staff.retired_at !== null)
    return `退職（${formatDateTimeAsDate(staff.retired_at)}）`
  return staff.status === 'retired' ? '退職' : '有効'
}

/**
 * 残る単発の予定 1 件の日付と時刻の範囲。`2026年11月2日（月）` と `09:00〜10:00` の形にし、翌日に終わる予定は `22:00〜翌 01:00` にする。
 * 画面が時刻の範囲の中で折り返さないよう、日付と時刻の範囲を分けて返す。
 */
export const formatRemainingScheduleParts = (schedule: StaffAssignments['schedules'][number]) => ({
  date: formatDate(schedule.date),
  time: formatTimeRange(
    schedule.start_time,
    schedule.end_time,
    schedule.ends_next_day ? 'nextDay' : 'sameDay',
  ),
})

/** 残る単発の予定 1 件の、`2026年11月2日（月） 09:00〜10:00` の形の日時。翌日に終わる予定は `22:00〜翌 01:00` にする。 */
export const formatRemainingSchedule = (schedule: StaffAssignments['schedules'][number]) => {
  const { date, time } = formatRemainingScheduleParts(schedule)
  return `${date} ${time}`
}

/**
 * 残る繰り返しの予定 1 件の、最初の回の日付と終了日（`2026年10月6日（火）から終了日なし、`）と、時刻の範囲。
 * 翌日に終わる繰り返しの時刻の範囲は `22:00〜翌 01:00` にする。画面が時刻の範囲の中で折り返さないよう、2 つを分けて返す。
 */
export const formatRemainingRecurringParts = (
  recurring: StaffAssignments['recurring_schedules'][number],
) => ({
  period:
    recurring.end_date === null
      ? `${formatDate(recurring.date)}から終了日なし、`
      : `${formatDate(recurring.date)}から${formatDate(recurring.end_date)}まで、`,
  time: formatTimeRange(
    recurring.start_time,
    recurring.end_time,
    recurring.ends_next_day ? 'nextDay' : 'sameDay',
  ),
})

/** 残る繰り返しの予定 1 件の、最初の回の日付、終了日、時刻の範囲をつないだ文。 */
export const formatRemainingRecurring = (
  recurring: StaffAssignments['recurring_schedules'][number],
) => {
  const { period, time } = formatRemainingRecurringParts(recurring)
  return `${period}${time}`
}

/** 残る予定、繰り返しの予定、担当の利用者が 1 つも無いか。 */
export const hasNoAssignments = (assignments: StaffAssignments) =>
  assignments.schedules.length === 0 &&
  assignments.recurring_schedules.length === 0 &&
  assignments.patients.length === 0

/** プロフィールの在籍の文。休職と退職だけに出し、状態の印が示す日付は繰り返さない。有効なら undefined を返す。 */
export const employmentText = (
  staff: Pick<StaffRecord, 'status' | 'leave_started_at' | 'leave_return_date'>,
) => {
  if (staff.status === 'on_leave') {
    const since =
      staff.leave_started_at === null ? '' : `${formatDateTimeAsDate(staff.leave_started_at)}から`
    return staff.leave_return_date === null
      ? `${since}休職です。`
      : `${since}休職です。戻る予定の日に自動では戻りません。`
  }
  if (staff.status === 'retired')
    return '退職は戻せません。メールアドレスと電話番号は退職で消し、名前、所属、役職は過去の予定と照合の結果のために残しています。'
  return undefined
}

/**
 * 権限の対象の名前を「、」でつなぐ。職員を対象にする権限は職員の名前を、チームを対象にする権限はチームの名前を出す。
 * 名前を引けない ID は、ID のまま出す。対象が無ければ空の文字列を返すので、呼ぶ側は対象の行ごと出さない。
 */
export const policyTargetText = (
  policy: Pick<StaffPolicy, 'target_user_ids' | 'target_team_ids'>,
  names: ReadonlyMap<string, string>,
) => {
  const ids = [...policy.target_user_ids, ...policy.target_team_ids]
  return ids.map((id) => names.get(id) ?? id).join('、')
}

/** 職員の権限のうち、役職に決まっていない、個別に足した権限の名前。役職を読み終えるまでは空にする。 */
export const addedPolicyNames = (staff: StaffDetail, position: Position | undefined) => {
  if (position === undefined) return []
  const defaults = new Set(position.policies.map((p) => p.id))
  return staff.policies.filter((p) => !defaults.has(p.policy_id)).map((p) => p.name)
}

/** 権限が対象に職員を取るか、チームを取るか。対象を指定しない権限は undefined にする。 */
export const policyTargetKind = (policy: Pick<Policy, 'code' | 'needs_target'>) => {
  if (!policy.needs_target) return undefined
  return policy.code.startsWith('schedule.team.') ? 'team' : 'user'
}

/** 状態の印の色の調子。休職は注意、退職は終わった状態である。 */
export const statusTone = (staff: Pick<StaffRecord, 'status'>) =>
  staff.status === 'on_leave' ? 'warning' : staff.status === 'retired' ? 'muted' : 'default'
