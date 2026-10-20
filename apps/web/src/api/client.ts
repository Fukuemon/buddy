import type {
  FacilityId,
  NameSearchParams,
  Patient,
  Schedule,
  ScheduleInput,
  ScheduleListParams,
  Staff,
  Team,
} from './types'

/** API が失敗の状態を返したときに投げる。 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 画面が使う API の操作。手元では createFakeBuddyApi の実装を使う。
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
