import type {
  CalendarCutover,
  CalendarCutoverCompletion,
  CalendarCutoverState,
  CalendarExport,
  CalendarExportIssue,
  Department,
  ExternalCalendar,
  Facility,
  FacilityId,
  ImportDecision,
  ImportPreview,
  ImportRange,
  ImportResult,
  NameSearchParams,
  Patient,
  PatientEndResult,
  PatientInput,
  PatientRecord,
  PatientSchedules,
  Policy,
  Position,
  ReceiptReport,
  ReceiptCsvError,
  RecurringRule,
  RecurringRuleChange,
  Schedule,
  ScheduleInput,
  ScheduleList,
  ScheduleListParams,
  ServiceCodeRecord,
  Staff,
  StaffAssignments,
  StaffCreateInput,
  StaffDetail,
  StaffPolicy,
  StaffPolicyInput,
  StaffRecord,
  StaffRetireResult,
  StaffUpdateInput,
  StaffUpdateResult,
  Team,
  TeamInput,
} from './types'

/**
 * API が失敗の状態を返したときに投げる。code は API の Error の code で、分からなければ undefined である。
 * csvErrors は、照合の入力の CSV の誤り（status が 422）である。
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly csvErrors: ReceiptCsvError[]

  constructor(status: number, message: string, csvErrors: ReceiptCsvError[] = [], code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.csvErrors = csvErrors
  }
}

/** 照合の入力。予定は、予定の CSV（schedules）か、Google カレンダーの対象の月（month、`YYYY-MM`）の一方で渡す。 */
export type ReceiptCheckInput =
  | { visits: Blob; schedules: Blob; month?: undefined }
  | { visits: Blob; month: string; schedules?: undefined }

/**
 * 照合の入力のファイルの合計の上限のバイト数。照合の API の MAX_UPLOAD_BYTES のデフォルト（10 MiB）は multipart の本文の全体に
 * 掛かるので、境界と見出しの分の 64 KiB を引く。
 */
export const MAX_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024 - 64 * 1024

/** server function の本文の上限のバイト数。本文を読む前に、src/start.ts がこれより大きいリクエストを拒む。 */
export const MAX_SERVER_FN_BODY_BYTES = 10 * 1024 * 1024

/** 照合の API の操作。 */
export interface ReceiptApi {
  /** 実訪問の CSV と予定を照合する。失敗は ApiError で投げ、入力の CSV の行のエラーは status が 422 になる。 */
  check(input: ReceiptCheckInput): Promise<ReceiptReport>
}

/**
 * 画面が使う API の操作。実装は createFakeBuddyApi と createHttpBuddyApi で、createBuddyApi が環境変数で選ぶ。
 *
 * どの操作も、事業所が見つからない、ほかの事業所のものを指した、のような失敗で ApiError を投げる。
 */
export interface BuddyApi {
  facilities: {
    /** 事業所を返す。画面は予定の正本（sourceMode）で、予定を書く操作を出すかを決める。 */
    get(facilityId: FacilityId): Promise<Facility>
  }
  /**
   * ログインした職員の自分の情報。どの操作も権限を求めない。
   * facilityId はログインした職員の事業所で、ほかの事業所を指すと status が 403 の ApiError を投げる。
   */
  me: {
    /** ログインした職員と、持っている権限を返す。 */
    get(facilityId: FacilityId): Promise<StaffDetail>
    /** ログインした職員に結び付いた、外していないカレンダーを、最後の取り込みを付けて返す。結び付いていなければ null を返す。 */
    externalCalendar(facilityId: FacilityId): Promise<ExternalCalendar | null>
  }
  /**
   * 予定。google_primary の事業所では、list と get は同期が写した Google カレンダーの予定（fromGoogleCalendar が true、etag を持つ）を返し、
   * create、update、cancel は Google カレンダーに書き、書けたときだけ成功する（ADR-0029）。
   * 書けないときは、予定の API の code（google_event_changed、google_write_pending、cutover_open など）を持つ ApiError を投げる。
   */
  schedules: {
    list(facilityId: FacilityId, params: ScheduleListParams): Promise<ScheduleList>
    /** 予定がなければ status が 404 の ApiError を投げる。 */
    get(facilityId: FacilityId, scheduleId: Schedule['id']): Promise<Schedule>
    /**
     * 画面が決めた ID が id の予定を作る。google_primary の事業所で送り直すときは、同じ id を渡すと Google の予定は 1 つのままになる。
     */
    create(facilityId: FacilityId, input: ScheduleInput, id: Schedule['id']): Promise<Schedule>
    /**
     * 予定を input の内容にする。etag は、画面が予定を読んだときの etag で、google_primary の事業所では必須である。buddy の予定では null を渡す。
     * 予定がなければ status が 404 の ApiError を投げる。
     */
    update(
      facilityId: FacilityId,
      scheduleId: Schedule['id'],
      input: ScheduleInput,
      etag: string | null,
    ): Promise<Schedule>
    /**
     * 予定を理由 reason でキャンセルする。etag は update と同じである。google_primary の事業所では、理由は Google カレンダーに書けないので保存しない。
     * 予定がなければ status が 404 の、キャンセル済みなら status が 409 の ApiError を投げる。
     */
    cancel(
      facilityId: FacilityId,
      scheduleId: Schedule['id'],
      reason: string,
      etag: string | null,
    ): Promise<void>
    /**
     * 誤って入れた予定を削除する（ADR-0040）。キャンセルと違い、理由を持たず、削除した予定は一覧と取得に出ない。
     * 回の ID を受けると、繰り返しの予定のその回を削除する。削除できるのは buddy_primary の事業所の、開始の日が今日以降の有効な予定だけである。
     * 予定がなければ status が 404 の、今日より前の予定なら status が 400 の、キャンセル済みなら status が 409 の、
     * google_primary の事業所なら status が 409 で code が google_primary の ApiError を投げる。
     */
    delete(facilityId: FacilityId, scheduleId: Schedule['id']): Promise<void>
    /**
     * input の日時を最初の回にし、規則 rule で繰り返す、ID が id の繰り返しの予定を作る。作った繰り返しの予定の ID と最初の日付を返す。
     * input の開始の日付が rule の回に当たらないときは、status が 400 の ApiError を投げる。id の扱いは create と同じである。
     */
    createRecurring(
      facilityId: FacilityId,
      input: ScheduleInput,
      rule: RecurringRule,
      id: string,
    ): Promise<{ id: string; date: string }>
    /**
     * 繰り返しの予定 recurringScheduleId（Schedule.recurrence.recurringScheduleId）の規則を、change.effectiveDate 以降の回について変える（ADR-0037）。
     * etag は、画面が回を読んだときの etag（親の予定の etag）で、google_primary の事業所では必須である。buddy の予定では null を渡す。
     * 変えた後の、effectiveDate 以降の回を持つ繰り返しの予定の ID と最初の日付を返す。分けたときは新しい繰り返しの予定である。
     */
    changeRule(
      facilityId: FacilityId,
      recurringScheduleId: string,
      change: RecurringRuleChange,
      etag: string | null,
    ): Promise<{ id: string; date: string }>
  }
  /**
   * 職員。list のほかは職員の管理の画面が使う。
   * 変える操作は、職員の管理の権限が無ければ status が 403 の ApiError を、職員が見つからなければ 404 の ApiError を投げる。
   */
  staff: {
    list(facilityId: FacilityId, params?: NameSearchParams): Promise<Staff[]>
    /** 休職と退職の職員を含めた全ての職員を、部署、チーム、役職、在籍の状態とともに、名前の順で返す。 */
    listRecords(facilityId: FacilityId): Promise<StaffRecord[]>
    /** 職員と権限を返す。ほかの事業所の職員を指すと status が 403 の ApiError を投げる。 */
    get(facilityId: FacilityId, staffId: Staff['id']): Promise<StaffDetail>
    /**
     * 職員を登録し、役職のデフォルトの権限を付ける。同じメールアドレスの職員がいれば status が 409 の、
     * 部署、チーム、役職が無ければ 400 の ApiError を投げる。
     */
    create(facilityId: FacilityId, input: StaffCreateInput): Promise<StaffDetail>
    /**
     * 名前、電話番号、部署、チーム、訪問するかを変える。予定か担当の利用者が残る職員を訪問しない職員に変えようとしたときは、
     * 拒まれた結果として残るものを返す。退職した職員では status が 409 の ApiError を投げる。
     */
    update(
      facilityId: FacilityId,
      staffId: Staff['id'],
      input: StaffUpdateInput,
    ): Promise<StaffUpdateResult>
    /**
     * 役職を変え、権限を新しい役職のデフォルトの権限に置き換える。職員の管理の権限を持つ最後の有効な職員を、
     * その権限を持たない役職に変えようとすると、status が 409 の ApiError を投げる。
     */
    changePosition(
      facilityId: FacilityId,
      staffId: Staff['id'],
      positionId: Position['id'],
    ): Promise<StaffDetail>
    /** 権限を足す。同じ権限を持っていれば status が 409 の ApiError を投げる。 */
    addPolicy(
      facilityId: FacilityId,
      staffId: Staff['id'],
      input: StaffPolicyInput,
    ): Promise<StaffDetail>
    /** 権限を外す。職員の管理の権限を持つ最後の有効な職員から外そうとすると、status が 409 の ApiError を投げる。 */
    removePolicy(
      facilityId: FacilityId,
      staffId: Staff['id'],
      userPolicyId: StaffPolicy['user_policy_id'],
    ): Promise<StaffDetail>
    /** 事業所の現地の日付で今日以降に残る、予定、繰り返しの予定、担当の利用者を返す。 */
    remainingAssignments(facilityId: FacilityId, staffId: Staff['id']): Promise<StaffAssignments>
    /**
     * 休職にする。returnDate（YYYY-MM-DD）は戻る予定の日のメモで、null なら持たない。
     * 自分か、職員の管理の権限を持つ最後の有効な職員か、退職した職員では status が 409 の ApiError を投げる。
     */
    startLeave(
      facilityId: FacilityId,
      staffId: Staff['id'],
      returnDate: string | null,
    ): Promise<StaffDetail>
    /** 休職の職員を有効に戻す。退職した職員では status が 409 の ApiError を投げる。 */
    reinstate(facilityId: FacilityId, staffId: Staff['id']): Promise<StaffDetail>
    /**
     * 退職にする。予定か担当の利用者が残れば、拒まれた結果として残るものを返す。
     * 自分か、職員の管理の権限を持つ最後の有効な職員では status が 409 の ApiError を投げる。
     */
    retire(facilityId: FacilityId, staffId: Staff['id']): Promise<StaffRetireResult>
  }
  teams: {
    list(facilityId: FacilityId): Promise<Team[]>
    /** 職員の管理の権限が無ければ status が 403、同じ名前のチームがあれば 409 の ApiError を投げる。 */
    create(facilityId: FacilityId, input: TeamInput): Promise<Team>
    /** 職員の管理の権限が無ければ status が 403、チームが無ければ 404、ほかの同じ名前のチームがあれば 409 の ApiError を投げる。 */
    update(facilityId: FacilityId, teamId: Team['id'], input: TeamInput): Promise<Team>
  }
  departments: {
    list(facilityId: FacilityId): Promise<Department[]>
    /** 職員の管理の権限が無ければ status が 403、同じ名前の部署があれば 409 の ApiError を投げる。 */
    create(facilityId: FacilityId, name: string): Promise<Department>
    /** 職員の管理の権限が無ければ status が 403、部署が無ければ 404、ほかの同じ名前の部署があれば 409 の ApiError を投げる。 */
    update(
      facilityId: FacilityId,
      departmentId: Department['id'],
      name: string,
    ): Promise<Department>
  }
  positions: {
    /** 役職を名前の順で返す。 */
    list(facilityId: FacilityId): Promise<Position[]>
  }
  policies: {
    /** 全ての権限を返す。権限は事業所ごとには持たないが、ほかの操作とそろえて事業所を受ける。 */
    list(facilityId: FacilityId): Promise<Policy[]>
  }
  /**
   * 利用者。list のほかは利用者の管理の画面が使う。
   * list と listRecords のほかは、職員の管理の権限が無ければ status が 403 の ApiError を、利用者が見つからなければ 404 の ApiError を投げる。
   */
  patients: {
    /** 利用の終了の利用者も返す。過去の予定の利用者名を出すためである。予定の利用者の候補は、呼ぶ側が activePatients で絞る。 */
    list(facilityId: FacilityId, params?: NameSearchParams): Promise<Patient[]>
    /** 利用の終了の利用者を含めた全ての利用者を、サービス、希望、担当の職員とともに、名前の順で返す。 */
    listRecords(facilityId: FacilityId): Promise<PatientRecord[]>
    /** 利用者を返す。ほかの事業所の利用者を指すと status が 403 の ApiError を投げる。 */
    get(facilityId: FacilityId, patientId: Patient['id']): Promise<PatientRecord>
    /**
     * 利用者を登録する。サービスコードか担当の職員が無いときと、担当に休職か退職の職員を指したときは、
     * status が 400 の ApiError を投げる。
     */
    create(facilityId: FacilityId, input: PatientInput): Promise<PatientRecord>
    /**
     * 利用者の名前、サービス、希望、担当の職員を置き換える。担当を休職か退職の職員に変えると、status が 400 の ApiError を投げる。
     * 今の担当のままなら、担当が休職か退職でも拒まれない。
     */
    update(
      facilityId: FacilityId,
      patientId: Patient['id'],
      input: PatientInput,
    ): Promise<PatientRecord>
    /** 事業所の現地の日付で今日以降に残る、予定と繰り返しの予定を返す。 */
    remainingSchedules(facilityId: FacilityId, patientId: Patient['id']): Promise<PatientSchedules>
    /** 利用を終了する。予定が残れば、拒まれた結果として残る予定を返す。 */
    endService(facilityId: FacilityId, patientId: Patient['id']): Promise<PatientEndResult>
    /** 利用中に戻し、担当の職員を assignedStaffId にする。休職か退職の職員を指すと status が 400 の ApiError を投げる。 */
    resumeService(
      facilityId: FacilityId,
      patientId: Patient['id'],
      assignedStaffId: Staff['id'],
    ): Promise<PatientRecord>
  }
  serviceCodes: {
    /** サービスコードを、予定の API の並びで返す。サービスコードは事業所ごとには持たないが、ほかの操作とそろえて事業所を受ける。 */
    list(facilityId: FacilityId): Promise<ServiceCodeRecord[]>
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
    /** カレンダーを読めるかを確認する。読めれば何も返さない。 */
    check(facilityId: FacilityId, calendarId: string): Promise<void>
    /** 職員にカレンダーを結び付ける。結び付けられない原因は、status が 409 の ApiError の code にある。 */
    link(
      facilityId: FacilityId,
      input: { staffId: Staff['id']; calendarId: string },
    ): Promise<ExternalCalendar>
    /** カレンダーを外す。取り込んだ予定は残る。 */
    unlink(facilityId: FacilityId, externalCalendarId: ExternalCalendar['id']): Promise<void>
    /**
     * 期間の予定を読み、取り込むとどうなるかを返す。予定は書かない。
     * 予定の正本の切り替えの間は、期間を切り替えの range_start から終わりの無い期間（range_end が null）にする。
     */
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
     * 確認が必要な書き出しを、Google カレンダーの変更を比べずに buddy の内容で書き直す待ちにする。
     * 確認が必要な書き出しでなければ、code が export_not_in_review の ApiError を投げる。
     */
    retryExport(facilityId: FacilityId, exportId: CalendarExport['id']): Promise<CalendarExport>
    /** 予定の正本の切り替えの状況を返す。open の切り替えが無ければ cutover は null で、カレンダーの last_import は null である。 */
    cutoverStatus(facilityId: FacilityId): Promise<CalendarCutoverState>
    /**
     * 予定の正本の切り替えを始める。始められない原因は、status が 409 の ApiError の code
     *（cutover_open、cutover_not_google_primary、cutover_sync_not_ready）にある。
     */
    startCutover(facilityId: FacilityId): Promise<CalendarCutover>
    /**
     * 切り替えを完了し、事業所の予定の正本を buddy にする。完了の確認を満たさなければ、拒まれた結果として満たさないカレンダーと予定を返す。
     * 切り替えが open でなければ、code が cutover_not_open の ApiError を投げる。
     */
    completeCutover(
      facilityId: FacilityId,
      cutoverId: CalendarCutover['id'],
    ): Promise<CalendarCutoverCompletion>
    /** 切り替えをやめ、この切り替えで取り込んだ予定を消す。切り替えが open でなければ、code が cutover_not_open の ApiError を投げる。 */
    cancelCutover(
      facilityId: FacilityId,
      cutoverId: CalendarCutover['id'],
    ): Promise<CalendarCutover>
  }
}
