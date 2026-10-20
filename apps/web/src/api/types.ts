import type { components as ReceiptComponents } from './generated/receipt'

/** 事業所の ID。API の `/v1/facilities/{facility_id}` に入る。 */
export type FacilityId = string

/** ログインした職員。 */
export type Viewer = {
  staffId: string
  staffName: string
  facilityId: FacilityId
}

export type Team = {
  id: string
  name: string
}

export type Staff = {
  id: string
  name: string
  teamId: Team['id']
}

export type Patient = {
  id: string
  name: string
}

export const SCHEDULE_KINDS = ['normal', 'visit'] as const
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
export type ServiceCode = (typeof SERVICE_CODES)[number]

export const SCHEDULE_CATEGORIES = ['night', 'emergency', 'hospitalization'] as const
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number]

/** 訪問の予定だけが持つ項目。 */
export type VisitDetail = {
  patientId: Patient['id']
  serviceCode: ServiceCode
  categories: ScheduleCategory[]
}

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

export type ScheduleListParams = {
  /** 期間の始まり（含む）。オフセットつきの ISO 8601 の日時。 */
  from: string
  /** 期間の終わり（含まない）。オフセットつきの ISO 8601 の日時。 */
  to: string
  /** 空か未指定のときは、事業所の全ての職員の予定を返す。 */
  staffIds?: Staff['id'][]
}

export type NameSearchParams = {
  /** 名前の部分一致。空か未指定のときは全件を返す。 */
  name?: string
}

/** 照合の結果。照合の API の Report をそのまま使う。 */
export type ReceiptReport = ReceiptComponents['schemas']['Report']
export type ReceiptRow = ReceiptComponents['schemas']['Result']
export type ReceiptCategory = ReceiptComponents['schemas']['Category']
export type ReceiptRowError = ReceiptComponents['schemas']['RowError']
