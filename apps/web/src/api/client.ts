import type {
  FacilityId,
  NameSearchParams,
  Patient,
  ReceiptReport,
  ReceiptRowError,
  Schedule,
  ScheduleInput,
  ScheduleListParams,
  Staff,
  Team,
} from './types'

/** API が失敗の状態を返したときに投げる。rowErrors は、照合の入力の CSV の行ごとの誤り（status が 422）である。 */
export class ApiError extends Error {
  readonly status: number
  readonly rowErrors: ReceiptRowError[]

  constructor(status: number, message: string, rowErrors: ReceiptRowError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.rowErrors = rowErrors
  }
}

/** 照合の入力。予定は、予定の CSV（schedules）か、Google カレンダーの対象の月（month、`YYYY-MM`）の一方で渡す。 */
export type ReceiptCheckInput =
  | { visits: Blob; schedules: Blob; month?: undefined }
  | { visits: Blob; month: string; schedules?: undefined }

/** 照合の API の操作。 */
export interface ReceiptApi {
  /** 実訪問の CSV と予定を照合する。失敗は ApiError で投げ、入力の CSV の行の誤りは status が 422 になる。 */
  check(input: ReceiptCheckInput): Promise<ReceiptReport>
}

/**
 * 画面が使う API の操作。実装は createFakeBuddyApi と createHttpBuddyApi で、createBuddyApi が環境変数で選ぶ。
 *
 * どの操作も、事業所が見つからない、ほかの事業所のものを指した、のような失敗で ApiError を投げる。
 */
export interface BuddyApi {
  schedules: {
    list(facilityId: FacilityId, params: ScheduleListParams): Promise<Schedule[]>
    /** 予定がなければ status が 404 の ApiError を投げる。 */
    get(facilityId: FacilityId, scheduleId: Schedule['id']): Promise<Schedule>
    create(facilityId: FacilityId, input: ScheduleInput): Promise<Schedule>
    /** 予定がなければ status が 404 の ApiError を投げる。 */
    update(
      facilityId: FacilityId,
      scheduleId: Schedule['id'],
      input: ScheduleInput,
    ): Promise<Schedule>
  }
  staff: {
    list(facilityId: FacilityId, params?: NameSearchParams): Promise<Staff[]>
  }
  teams: {
    list(facilityId: FacilityId): Promise<Team[]>
  }
  patients: {
    list(facilityId: FacilityId, params?: NameSearchParams): Promise<Patient[]>
  }
}
