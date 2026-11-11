import type {
  FacilityId,
  NameSearchParams,
  Patient,
  Schedule,
  ScheduleListParams,
  Staff,
} from './types'

/** 事業所の全てのデータの key。 */
const facility = (facilityId: FacilityId) => ['facilities', facilityId] as const
/** 名前の条件によらない、在籍の職員の一覧の key。 */
const staffAll = (facilityId: FacilityId) => [...facility(facilityId), 'staff'] as const
/** 全ての職員の詳細の key。 */
const staffDetails = (facilityId: FacilityId) => [...facility(facilityId), 'staff-detail'] as const
/** 名前の条件によらない、利用中の利用者の一覧の key。 */
const patientsAll = (facilityId: FacilityId) => [...facility(facilityId), 'patients'] as const
/** 期間と職員の条件によらない、予定の一覧と 1 件の key。 */
const schedulesAll = (facilityId: FacilityId) => [...facility(facilityId), 'schedules'] as const

/**
 * TanStack Query の key の factory。リソースごとに 1 つ置き、全ての機能がここから key を作る。
 *
 * 事業所のデータの key は `['facilities', facilityId, <リソース>, ...]` の形にする。
 * `all` の key は前方一致で、そのリソースの条件ごとの query をまとめて invalidate するのに使う。
 */
export const queryKeys = {
  /** ログインした職員。 */
  viewer: () => ['viewer'] as const,
  /** 照合の結果。API から取り直せないので、cache にだけ置く。 */
  receiptResult: () => ['receipt', 'result'] as const,
  /** 事業所の全てのデータ。 */
  facility,
  /** 事業所そのもの（名前と予定の管理先）。予定の画面とカレンダーの画面で cache を共有する。 */
  facilityDetail: (facilityId: FacilityId) => [...facility(facilityId), 'detail'] as const,

  /** 自分の情報の画面が読む、ログインした職員の詳細と、結び付いたカレンダー。 */
  me: {
    detail: (facilityId: FacilityId) => [...facility(facilityId), 'me', 'detail'] as const,
    calendar: (facilityId: FacilityId) => [...facility(facilityId), 'me', 'calendar'] as const,
  },

  departments: (facilityId: FacilityId) => [...facility(facilityId), 'departments'] as const,
  teams: (facilityId: FacilityId) => [...facility(facilityId), 'teams'] as const,
  positions: (facilityId: FacilityId) => [...facility(facilityId), 'positions'] as const,
  policies: (facilityId: FacilityId) => [...facility(facilityId), 'policies'] as const,
  serviceCodes: (facilityId: FacilityId) => [...facility(facilityId), 'service-codes'] as const,

  /** 在籍の職員。予定の画面、職員の管理の画面、カレンダーの画面で cache を共有する。 */
  staff: {
    all: staffAll,
    list: (facilityId: FacilityId, params: NameSearchParams = {}) =>
      [...staffAll(facilityId), params] as const,
    /** 休職と退職を含む職員。 */
    records: (facilityId: FacilityId) => [...facility(facilityId), 'staff-records'] as const,
    details: staffDetails,
    detail: (facilityId: FacilityId, staffId: Staff['id']) =>
      [...staffDetails(facilityId), staffId] as const,
    /** 休職と退職の確認に出す、残る予定と担当の利用者。 */
    assignments: (facilityId: FacilityId, staffId: Staff['id']) =>
      [...facility(facilityId), 'staff-assignments', staffId] as const,
  },

  /** 利用中の利用者。予定の画面とカレンダーの画面で cache を共有する。 */
  patients: {
    all: patientsAll,
    list: (facilityId: FacilityId, params: NameSearchParams = {}) =>
      [...patientsAll(facilityId), params] as const,
    /** 利用の終了を含む利用者。 */
    records: (facilityId: FacilityId) => [...facility(facilityId), 'patient-records'] as const,
    detail: (facilityId: FacilityId, patientId: Patient['id']) =>
      [...facility(facilityId), 'patient-detail', patientId] as const,
    /** 利用の終了の確認に出す、残る予定。 */
    remaining: (facilityId: FacilityId, patientId: Patient['id']) =>
      [...facility(facilityId), 'patient-remaining', patientId] as const,
  },

  schedules: {
    all: schedulesAll,
    list: (facilityId: FacilityId, params: ScheduleListParams) =>
      [...schedulesAll(facilityId), 'list', params] as const,
    detail: (facilityId: FacilityId, scheduleId: Schedule['id']) =>
      [...schedulesAll(facilityId), 'detail', scheduleId] as const,
  },

  calendars: {
    /** 外していないカレンダー。 */
    list: (facilityId: FacilityId) => [...facility(facilityId), 'calendars'] as const,
    serviceAccount: (facilityId: FacilityId) =>
      [...facility(facilityId), 'calendar-service-account'] as const,
    exportIssues: (facilityId: FacilityId) =>
      [...facility(facilityId), 'calendar-export-issues'] as const,
    /** 予定の管理の移行の状況。取り込みの画面と移行の画面で cache を共有する。 */
    cutover: (facilityId: FacilityId) => [...facility(facilityId), 'calendar-cutover'] as const,
  },
}
