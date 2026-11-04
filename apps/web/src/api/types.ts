import type { components as ReceiptComponents } from './generated/receipt'
import type {
  components as ScheduleComponents,
  operations as ScheduleOperations,
} from './generated/schedule'

/** 事業所の ID。API の `/v1/facilities/{facility_id}` に入る。 */
export type FacilityId = string

/** 事業所の予定の正本。google_primary は Google カレンダー、buddy_primary は buddy である（ADR-0035）。 */
export type SourceMode = ScheduleComponents['schemas']['SourceMode']

/** 事業所。API の型の ID、名前、予定の正本だけを使う。 */
export type Facility = {
  id: FacilityId
  name: string
  sourceMode: SourceMode
}

/** ログインした職員。 */
export type Viewer = {
  staffId: string
  staffName: string
  facilityId: FacilityId
  /**
   * 職員が持つ権限の code の一覧。予定の API の code をそのまま写す。
   * 画面の出し分けだけに使い、hasPermission で読む。拒むのは API である（ADR-0025）。
   */
  policyCodes: readonly string[]
  /** 予定の権限（schedule.*）と対象。画面の出し分けだけに使い、拒むのは予定の API である。 */
  schedulePolicies: readonly SchedulePolicy[]
}

/** 予定の権限の code。予定の API のマイグレーションが入れる値と同じにする。 */
export const SCHEDULE_POLICY_CODES = [
  'schedule.self.edit',
  'schedule.user.read',
  'schedule.user.edit',
  'schedule.team.read',
  'schedule.team.edit',
  'schedule.all.read',
  'schedule.all.edit',
] as const

/** 予定の権限の code。 */
export type SchedulePolicyCode = (typeof SCHEDULE_POLICY_CODES)[number]

/** ログインした職員の予定の権限 1 つ。対象は、職員とチームを対象にする権限だけが持つ。 */
export type SchedulePolicy = {
  code: SchedulePolicyCode
  targetStaffIds: readonly string[]
  targetTeamIds: readonly string[]
}

/** チーム。API の型の ID、名前、色だけを使う。色はチームの色のトークンの名前（team- の後ろ）である。 */
export type Team = Pick<ScheduleComponents['schemas']['Team'], 'id' | 'name' | 'color'>

/** チームの色。packages/ui のチームの色のトークンの名前（team- の後ろ）である。 */
export type TeamColor = Team['color']

/** チームの色の 8 色。予定の API が色を省いたチームに選ぶ順で、画面の選択肢もこの順に並べる。 */
export const TEAM_COLORS = [
  'blue',
  'orange',
  'magenta',
  'cyan',
  'yellow',
  'purple',
  'green',
  'lime',
] as const satisfies readonly TeamColor[]

/** チームを作るときと変えるときに送る値。 */
export type TeamInput = Pick<Team, 'name' | 'color'>

/** 職員。名前は API の username である。 */
export type Staff = {
  id: string
  name: string
  teamId: Team['id']
  /** 退職した職員では null である。 */
  email: string | null
  /** 休職（on_leave）か退職（retired）の職員の状態。有効な職員は持たない。 */
  status?: Exclude<ScheduleComponents['schemas']['StaffStatus'], 'active'>
  /** 訪問しない職員は true を持つ。訪問する職員は持たない（ADR-0022）。 */
  nonVisiting?: true
}

/** 利用者。API の型の ID と名前と、利用の終了かだけを使う。 */
export type Patient = Pick<ScheduleComponents['schemas']['Patient'], 'id' | 'name'> & {
  /** 利用の終了の利用者は true を持つ。利用中の利用者は持たない（ADR-0021）。 */
  ended?: true
}

export const SCHEDULE_KINDS = ['normal', 'visit'] as const
/** 予定の種類。API の予定の種類の名前（通常、訪問）に当たる。 */
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/** 訪問のサービスコードの表記。予定の API のサービスコードの一覧（listServiceCodes）の code を、そのまま使う。 */
export type ServiceCode = string

export const SCHEDULE_CATEGORIES = ['night', 'emergency', 'hospitalization'] as const
/** 訪問の区分。API の訪問の区分の名前（夜勤、緊急、入院）に当たる。 */
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number]

/** 訪問の予定だけが持つ項目。 */
type VisitDetail = {
  patientId: Patient['id']
  serviceCode: ServiceCode
  categories: ScheduleCategory[]
}

/** 予定。API の日付と時刻を、時差つきの日時にまとめて持つ。 */
export type Schedule = {
  id: string
  facilityId: FacilityId
  kind: ScheduleKind
  title: string
  staffId: Staff['id']
  /** オフセットつきの ISO 8601 の日時。 */
  startsAt: string
  /** オフセットつきの ISO 8601 の日時。 */
  endsAt: string
  description: string
  /** kind が visit のときだけある。 */
  visit?: VisitDetail
  /** キャンセルした予定のときだけある。 */
  cancel?: { reason: string }
  /**
   * google_primary の事業所で、同期が写した Google カレンダーの予定（Projection）のときだけ true を持つ。
   * buddy から変えられず、予定の API の 1 件の取得（GET /v1/schedules/{id}）も無い。
   */
  fromGoogleCalendar?: true
  /** Google カレンダーの予定のうち、buddy の予定に読み替えられず確認が必要な予定のときだけ、その理由を持つ。 */
  reviewReason?: ScheduleReviewReason
}

/** Google カレンダーの予定を、buddy の予定に読み替えられなかった理由。予定の API の ScheduleReviewReason をそのまま使う。 */
export type ScheduleReviewReason = ScheduleComponents['schemas']['ScheduleReviewReason']

/** 結び付けたカレンダーの同期の状況。予定の API の CalendarSyncStatus をそのまま使う。 */
export type CalendarSyncStatus = ScheduleComponents['schemas']['CalendarSyncStatus']

/** 予定の一覧の結果。 */
export type ScheduleList = {
  /** 期間と職員で絞った予定。 */
  schedules: Schedule[]
  /**
   * 確認が必要な予定（reviewReason を持つ予定）。期間で絞らず、職員の絞り込みだけを当てる。
   * 繰り返しの規則を写せない予定（recurrence_unsupported）は最初の回の日時で返り、表示の期間の外のことがある。
   */
  needsReview: Schedule[]
  sourceMode: SourceMode
  /** google_primary の事業所のカレンダーの同期の状況。職員の絞り込みを当てる。buddy_primary の事業所では空である。 */
  calendarSyncs: CalendarSyncStatus[]
  /** google_primary の事業所で、予定の正本を buddy に切り替えている間の open の切り替え。無ければ null である。 */
  cutover: OpenCalendarCutover | null
}

/** 予定の作成と更新で送る値。 */
export type ScheduleInput = Omit<
  Schedule,
  'id' | 'facilityId' | 'fromGoogleCalendar' | 'reviewReason'
>

/** 予定の一覧の条件。 */
export type ScheduleListParams = {
  /** 期間の始まり（含む）。オフセットつきの ISO 8601 の日時。 */
  from: string
  /** 期間の終わり（含まない）。オフセットつきの ISO 8601 の日時。 */
  to: string
  /** 空か未指定のときは、事業所の全ての職員の予定を返す。 */
  staffIds?: Staff['id'][]
  /** true のときだけ、キャンセルした予定も返す。 */
  includeCancelled?: boolean
}

/** 職員と利用者の一覧の条件。 */
export type NameSearchParams = {
  /** 名前の部分一致。空か未指定のときは全件を返す。 */
  name?: string
}

/** 照合の結果。照合の API の Report をそのまま使う。 */
export type ReceiptReport = ReceiptComponents['schemas']['Report']
/** 照合の結果の 1 行。照合の API の Result をそのまま使う。 */
export type ReceiptRow = ReceiptComponents['schemas']['Result']
/** 照合の結果の区分。mismatch は不整合、schedule_only は予定のみ、visit_only は実績のみ、match は整合。 */
export type ReceiptCategory = ReceiptComponents['schemas']['Category']
/** 入力の CSV の誤りの 1 件。照合の API の CsvError をそのまま使う。 */
export type ReceiptCsvError = ReceiptComponents['schemas']['CsvError']
/** 照合に使わなかった Google カレンダーの予定。照合の API の Warning をそのまま使う。 */
export type ReceiptWarning = ReceiptComponents['schemas']['Warning']

type ScheduleSchemas = ScheduleComponents['schemas']

/** 職員に結び付けた Google カレンダー。予定の API の ExternalCalendar をそのまま使う。 */
export type ExternalCalendar = ScheduleSchemas['ExternalCalendar']
/** 取り込みの期間。両端の日を含む YYYY-MM-DD。 */
export type ImportRange = ScheduleSchemas['ImportRange']
/** 取り込みのプレビュー。予定の API の ImportPreview をそのまま使う。 */
export type ImportPreview = ScheduleSchemas['ImportPreview']
/** プレビューの確認が必要な予定。 */
export type ImportReviewItem = ScheduleSchemas['ImportReviewItem']
/** プレビューの取り込まない予定。 */
export type ImportSkippedItem = ScheduleSchemas['ImportSkippedItem']
/** 確認が必要な予定 1 件の取り込み方。 */
export type ImportDecision = ScheduleSchemas['ImportDecision']
/** 取り込みの結果。 */
export type ImportResult = ScheduleSchemas['ImportResult']
/** 予定を Google カレンダーに書き出す待ち。予定の API の CalendarExport をそのまま使う。 */
export type CalendarExport = ScheduleSchemas['CalendarExport']
/** 確認が必要な書き出しと、その予定の日時と職員。予定のタイトルと利用者名は持たない。 */
export type CalendarExportIssue = ScheduleSchemas['CalendarExportIssue']
/** 予定の正本を Google カレンダーから buddy に切り替える作業の記録。予定の API の CalendarCutover をそのまま使う。 */
export type CalendarCutover = ScheduleSchemas['CalendarCutover']
/** 切り替えの状況。open の切り替えと、カレンダーごとの同期とこの切り替えの最後の取り込み。 */
export type CalendarCutoverState = ScheduleSchemas['CalendarCutoverState']
/** 切り替えの状況のうち、結び付けたカレンダー 1 つ。 */
export type CalendarCutoverCalendar = ScheduleSchemas['CalendarCutoverCalendar']
/** 切り替えの完了の確認を満たさないカレンダーか予定。予定のタイトルは持たない。 */
export type CalendarCutoverUnmet = ScheduleSchemas['CalendarCutoverUnmet']
/** 予定の一覧が返す、open の切り替えの開始の時刻と取り込みの期間の最初の日。 */
export type OpenCalendarCutover = ScheduleSchemas['OpenCalendarCutover']
/** 切り替えの完了の結果。完了の確認を満たさずに拒まれたときは、満たさないカレンダーと予定を unmet に持つ。 */
export type CalendarCutoverCompletion =
  | { completed: CalendarCutover }
  | { unmet: CalendarCutoverUnmet[] }

type RequestBody<K extends keyof ScheduleOperations> = ScheduleOperations[K] extends {
  requestBody: { content: { 'application/json': infer Body } }
}
  ? Body
  : never

/** 職員の管理の画面で出す職員。予定の API の Staff をそのまま使う。 */
export type StaffRecord = ScheduleSchemas['Staff']
/** 職員と、職員が持つ権限。予定の API の StaffDetail をそのまま使う。 */
export type StaffDetail = ScheduleSchemas['StaffDetail']
/** 職員が持つ権限 1 つと、その対象。 */
export type StaffPolicy = StaffDetail['policies'][number]
/** 職員を休職、退職、訪問しない職員にするときに残る、今日以降の予定、繰り返しの予定、担当の利用者。 */
export type StaffAssignments = ScheduleSchemas['StaffAssignments']
/** 部署。API の型の ID と名前だけを使う。 */
export type Department = Pick<ScheduleSchemas['Unit'], 'id' | 'name'>
/** 役職と、そのデフォルトの権限。予定の API の Position をそのまま使う。 */
export type Position = ScheduleSchemas['Position']
/** 職員に与える権限。予定の API の Policy をそのまま使う。 */
export type Policy = ScheduleSchemas['Policy']
/** 職員の登録で送る値。予定の API の createUser の本文をそのまま使う。 */
export type StaffCreateInput = RequestBody<'createUser'>
/** 職員の名前、電話番号、部署、チーム、訪問するかの変更で送る値。予定の API の updateUser の本文をそのまま使う。 */
export type StaffUpdateInput = RequestBody<'updateUser'>
/** 職員に権限を足すときに送る値。予定の API の addUserPolicy の本文をそのまま使う。 */
export type StaffPolicyInput = RequestBody<'addUserPolicy'>
/** 退職の結果。予定か担当の利用者が残って拒まれたときは、残るものを assignments に持つ。 */
export type StaffRetireResult = { retired: StaffDetail } | { assignments: StaffAssignments }
/** 職員の変更の結果。予定か担当の利用者が残る職員を訪問しない職員に変えようとして拒まれたときは、残るものを assignments に持つ。 */
export type StaffUpdateResult = { updated: StaffDetail } | { assignments: StaffAssignments }

/** 利用者の管理の画面で出す利用者。予定の API の Patient をそのまま使う。 */
export type PatientRecord = ScheduleSchemas['Patient']
/** 利用者の登録と変更で送る値。予定の API の createPatient の本文をそのまま使う（updatePatient も同じ形）。 */
export type PatientInput = RequestBody<'createPatient'>
/** 利用者の利用を終了するときに残る、今日以降の予定と繰り返しの予定。 */
export type PatientSchedules = ScheduleSchemas['PatientSchedules']
/** サービスコードと提供時間の範囲。予定の API の ServiceCode をそのまま使う。 */
export type ServiceCodeRecord = ScheduleSchemas['ServiceCode']
/** 利用の終了の結果。予定が残って拒まれたときは、残る予定を schedules に持つ。 */
export type PatientEndResult = { ended: PatientRecord } | { schedules: PatientSchedules }
