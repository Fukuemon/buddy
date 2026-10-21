import type { components as ReceiptComponents } from './generated/receipt'
import type { components as ScheduleComponents } from './generated/schedule'

/** 事業所の ID。API の `/v1/facilities/{facility_id}` に入る。 */
export type FacilityId = string

/** 職員の管理の権限の code。予定の API のマイグレーションが入れる値と同じにする。 */
export const STAFF_MANAGE = 'staff.manage'

/** ログインした職員。 */
export type Viewer = {
  staffId: string
  staffName: string
  facilityId: FacilityId
  /** 職員の管理の権限（staff.manage）を持つか。画面の出し分けだけに使い、拒むのは API である。 */
  canManageStaff: boolean
}

/** チーム。API の型の ID と名前だけを使う。 */
export type Team = Pick<ScheduleComponents['schemas']['Unit'], 'id' | 'name'>

/** 職員。名前は API の username である。 */
export type Staff = {
  id: string
  name: string
  teamId: Team['id']
  email: string
}

/** 利用者。API の型の ID と名前だけを使う。 */
export type Patient = Pick<ScheduleComponents['schemas']['Patient'], 'id' | 'name'>

export const SCHEDULE_KINDS = ['normal', 'visit'] as const
/** 予定の種類。API の予定の種類の名前（通常、訪問）に当たる。 */
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

export const SERVICE_CODES = [
  '訪看I2',
  '訪看I3',
  '訪看I4',
  '訪看I5',
  '訪看I5・2超',
  '予防看I2',
  '予防看I3',
  '予防看I4',
  '予防看I5',
  '予防看I5・2超',
  '医',
] as const
/** 訪問のサービスコード。表記は schedule-api のマイグレーションが入れる値と同じにする。 */
export type ServiceCode = (typeof SERVICE_CODES)[number]

export const SCHEDULE_CATEGORIES = ['night', 'emergency', 'hospitalization'] as const
/** 訪問の区分。API の訪問の区分の名前（夜勤、緊急、入院）に当たる。 */
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number]

/** 訪問の予定だけが持つ項目。 */
export type VisitDetail = {
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
}

/** 予定の作成と更新で送る値。 */
export type ScheduleInput = Omit<Schedule, 'id' | 'facilityId'>

/** 予定の一覧の条件。 */
export type ScheduleListParams = {
  /** 期間の始まり（含む）。オフセットつきの ISO 8601 の日時。 */
  from: string
  /** 期間の終わり（含まない）。オフセットつきの ISO 8601 の日時。 */
  to: string
  /** 空か未指定のときは、事業所の全ての職員の予定を返す。 */
  staffIds?: Staff['id'][]
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
/** CSV の行を読めなかった理由。照合の API の RowError をそのまま使う。 */
export type ReceiptRowError = ReceiptComponents['schemas']['RowError']

type ScheduleSchemas = ScheduleComponents['schemas']

/** 職員に結び付けた Google カレンダー。予定の API の ExternalCalendar をそのまま使う。 */
export type ExternalCalendar = ScheduleSchemas['ExternalCalendar']
/** 取り込みの期間。両端の日を含む YYYY-MM-DD。 */
export type ImportRange = ScheduleSchemas['ImportRange']
/** 取り込みの下見。予定の API の ImportPreview をそのまま使う。 */
export type ImportPreview = ScheduleSchemas['ImportPreview']
/** 下見の確かめが要る予定。 */
export type ImportReviewItem = ScheduleSchemas['ImportReviewItem']
/** 下見の取り込まない予定。 */
export type ImportSkippedItem = ScheduleSchemas['ImportSkippedItem']
/** 確かめが要る予定 1 件の取り込み方。 */
export type ImportDecision = ScheduleSchemas['ImportDecision']
/** 取り込みの結果。 */
export type ImportResult = ScheduleSchemas['ImportResult']
/** 予定を Google カレンダーに書き出す待ち。予定の API の CalendarExport をそのまま使う。 */
export type CalendarExport = ScheduleSchemas['CalendarExport']
/** 確かめが要る書き出しと、その予定の日時と職員。予定の題名と利用者名は持たない。 */
export type CalendarExportIssue = ScheduleSchemas['CalendarExportIssue']
