import type {
  CalendarExport,
  CalendarExportIssue,
  ExternalCalendar,
  FacilityId,
  ImportDecision,
  ImportPreview,
  ImportRange,
  ImportResult,
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

/**
 * API が失敗の状態を返したときに投げる。code は API の Error の code で、分からなければ undefined である。
 * rowErrors は、照合の入力の CSV の行ごとの誤り（status が 422）である。
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly rowErrors: ReceiptRowError[]

  constructor(status: number, message: string, rowErrors: ReceiptRowError[] = [], code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
  /**
   * Google カレンダーの結び付けと予定の取り込み。全ての操作は、職員の管理の権限が無ければ status が 403 の ApiError を投げる。
   * カレンダーを読む操作は、読めなければ code が calendar_unreadable、届かなければ calendar_unavailable、
   * サービスアカウントの設定が無ければ calendar_not_configured の ApiError を投げる。
   */
  calendars: {
    /** 職員がカレンダーを共有する相手のサービスアカウントのメールアドレスを返す。 */
    serviceAccount(facilityId: FacilityId): Promise<string>
    /** 外していないカレンダーを、最後の取り込みを付けて返す。 */
    list(facilityId: FacilityId): Promise<ExternalCalendar[]>
    /** カレンダーを読めるかを確かめる。読めれば何も返さない。 */
    check(facilityId: FacilityId, calendarId: string): Promise<void>
    /** 職員にカレンダーを結び付ける。結び付けられない原因は、status が 409 の ApiError の code にある。 */
    link(
      facilityId: FacilityId,
      input: { staffId: Staff['id']; calendarId: string },
    ): Promise<ExternalCalendar>
    /** カレンダーを外す。取り込んだ予定は残る。 */
    unlink(facilityId: FacilityId, externalCalendarId: ExternalCalendar['id']): Promise<void>
    /** 期間の予定を読み、取り込むとどうなるかを返す。予定は書かない。 */
    preview(
      facilityId: FacilityId,
      externalCalendarId: ExternalCalendar['id'],
      range: ImportRange,
    ): Promise<ImportPreview>
    /** 期間の予定を取り込む。確定できない原因は、status が 409 の ApiError の code にある。 */
    import(
      facilityId: FacilityId,
      externalCalendarId: ExternalCalendar['id'],
      input: ImportRange & { decisions: ImportDecision[] },
    ): Promise<ImportResult>
    /** Google カレンダーで予定が変わっていたか消えていたか、書けなかった書き出しを、新しく変わった順に返す。 */
    exportIssues(facilityId: FacilityId): Promise<CalendarExportIssue[]>
    /**
     * 確かめが要る書き出しを、Google カレンダーの変更を比べずに buddy の内容で書き直す待ちにする。
     * 確かめが要る書き出しでなければ、code が export_not_in_review の ApiError を投げる。
     */
    retryExport(facilityId: FacilityId, exportId: CalendarExport['id']): Promise<CalendarExport>
  }
}
