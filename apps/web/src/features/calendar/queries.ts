import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import type {
  CalendarExport,
  ExternalCalendar,
  FacilityId,
  ImportDecision,
  ImportRange,
  Staff,
} from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

/** 事業所の、外していないカレンダーの一覧の query。 */
export const externalCalendarListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.calendars.list(facilityId),
    queryFn: () => api.calendars.list(facilityId),
  })

/** サービスアカウントのメールアドレスの query。サービスアカウントが設定されていなければ null になる。 */
export const serviceAccountQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.calendars.serviceAccount(facilityId),
    queryFn: async () => {
      try {
        return await api.calendars.serviceAccount(facilityId)
      } catch (error) {
        if (error instanceof ApiError && error.code === 'calendar_not_configured') return null
        throw error
      }
    },
  })

/** 事業所の確認が必要な書き出しの query。 */
export const exportIssueListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.calendars.exportIssues(facilityId),
    queryFn: () => api.calendars.exportIssues(facilityId),
  })

/** 確認が必要な書き出しを、buddy の内容で書き直す待ちにする mutation。成否によらず、一覧を読み直す。 */
export const useRetryExport = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (exportId: CalendarExport['id']) => api.calendars.retryExport(facilityId, exportId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.exportIssues(facilityId) }),
  })
}

/** 確認が必要な書き出しの予定を、Google カレンダーの内容に合わせる mutation。成否によらず、一覧と予定を読み直す。 */
export const useAcceptExport = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (exportId: CalendarExport['id']) =>
      api.calendars.acceptExport(facilityId, exportId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.calendars.exportIssues(facilityId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) }),
      ]),
  })
}

/** 事業所の全ての職員の query。 */
export const staffListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.staff.list(facilityId),
    queryFn: () => api.staff.list(facilityId),
  })

/** 事業所の全ての利用者の query。確認が必要な予定の利用者の選択肢に使う。 */
export const patientListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.patients.list(facilityId),
    queryFn: () => api.patients.list(facilityId),
  })

/** カレンダーを読めるかを確認する mutation。 */
export const useCheckCalendar = () => {
  const { api, facilityId } = useBuddyApi()
  return useMutation({
    mutationFn: (calendarId: string) => api.calendars.check(facilityId, calendarId),
  })
}

/** 職員にカレンダーを結び付ける mutation。成功したらカレンダーの一覧を読み直す。 */
export const useLinkCalendar = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { staffId: Staff['id']; calendarId: string }) =>
      api.calendars.link(facilityId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.list(facilityId) }),
  })
}

/** カレンダーを外す mutation。成功したらカレンダーの一覧を読み直す。 */
export const useUnlinkCalendar = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (externalCalendarId: ExternalCalendar['id']) =>
      api.calendars.unlink(facilityId, externalCalendarId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.list(facilityId) }),
  })
}

/** 取り込みをプレビューする mutation。予定は書かないので、cache は変えない。 */
export const usePreviewImport = () => {
  const { api, facilityId } = useBuddyApi()
  return useMutation({
    mutationFn: ({
      calendarId,
      range,
    }: {
      calendarId: ExternalCalendar['id']
      range: ImportRange
    }) => api.calendars.preview(facilityId, calendarId, range),
  })
}

/** 予定を取り込む mutation。成功したら、カレンダーの最後の取り込みと予定を読み直す。 */
export const useImportCalendar = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      calendarId,
      range,
      decisions,
    }: {
      calendarId: ExternalCalendar['id']
      range: ImportRange
      decisions: ImportDecision[]
    }) => api.calendars.import(facilityId, calendarId, { ...range, decisions }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.calendars.list(facilityId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) }),
      ]),
  })
}
