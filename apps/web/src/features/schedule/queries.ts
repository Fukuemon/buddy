import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { BuddyApi } from '#/api/BuddyApi'
import type {
  FacilityId,
  NameSearchParams,
  RecurringRule,
  RecurringRuleChange,
  Schedule,
  ScheduleInput,
  ScheduleListParams,
} from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

import { getCalendarRange } from './lib/calendarRange'
import { CALENDAR_SYNC_REFRESH_MS } from './lib/calendarSync'
import { toDateKey } from './lib/dateTime'
import { resolveCalendarView, type ScheduleSearch } from './schema/scheduleSearch'

/**
 * 事業所の予定を、params の期間（from を含み、to を含まない）と職員で絞って読む query。
 * staffIds が空なら全ての職員の予定を読み、includeCancelled が true のときだけキャンセルした予定も読む。
 */
export const scheduleListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: ScheduleListParams,
) =>
  queryOptions({
    queryKey: queryKeys.schedules.list(facilityId, params),
    queryFn: () => api.schedules.list(facilityId, params),
    refetchInterval: (query) =>
      query.state.data?.sourceMode === 'google_primary' ? CALENDAR_SYNC_REFRESH_MS : false,
  })

/** 事業所を読む query。予定の正本（sourceMode）で、予定を作る操作と編集の操作を出すかを決める。 */
export const facilityQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.facilityDetail(facilityId),
    queryFn: () => api.facilities.get(facilityId),
  })

/** 予定を読む query。予定が無ければ status が 404 の ApiError を error に持つ。 */
export const scheduleQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  scheduleId: Schedule['id'],
) =>
  queryOptions({
    queryKey: queryKeys.schedules.detail(facilityId, scheduleId),
    queryFn: () => api.schedules.get(facilityId, scheduleId),
  })

/** 事業所の職員を、params の名前の部分一致で絞って読む query。名前が空か未指定なら全ての職員を読む。 */
export const staffListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: NameSearchParams = {},
) =>
  queryOptions({
    queryKey: queryKeys.staff.list(facilityId, params),
    queryFn: () => api.staff.list(facilityId, params),
  })

/** 事業所のチームの一覧の query。チームは名前で絞らず、全件を取る。 */
export const teamListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.teams(facilityId),
    queryFn: () => api.teams.list(facilityId),
  })

/** 事業所の利用者を、params の名前の部分一致で絞って読む query。名前が空か未指定なら全ての利用者を読み、利用の終了の利用者も含む。 */
export const patientListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: NameSearchParams = {},
) =>
  queryOptions({
    queryKey: queryKeys.patients.list(facilityId, params),
    queryFn: () => api.patients.list(facilityId, params),
  })

/** 事業所のサービスコードと提供時間の範囲の一覧の query。予定の API の一覧の順に並ぶ。 */
export const serviceCodeListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.serviceCodes(facilityId),
    queryFn: () => api.serviceCodes.list(facilityId),
  })

/**
 * 画面が決めた ID が id の予定を作る。成功すると、事業所の予定の取得の結果を捨てて取り直す。
 * 送り直すときは同じ id を渡す。google_primary の事業所で、Google カレンダーの予定を 1 つのままにするためである。
 */
export const useCreateSchedule = (id: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => api.schedules.create(facilityId, input, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) }),
  })
}

/**
 * ID が id の繰り返しの予定を作る。id は useCreateSchedule と同じく、送り直しでも同じ値を渡す。
 * 成功すると、事業所の予定の取得の結果を捨てて取り直す。
 */
export const useCreateRecurringSchedule = (id: string) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, rule }: { input: ScheduleInput; rule: RecurringRule }) =>
      api.schedules.createRecurring(facilityId, input, rule, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) }),
  })
}

/**
 * 予定を更新する。etag は、編集を開いたときに読んだ予定の etag で、buddy の予定では null である。
 * 成功すると、事業所の予定の取得の結果を捨てて取り直す。
 */
export const useUpdateSchedule = (scheduleId: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, etag }: { input: ScheduleInput; etag: string | null }) =>
      api.schedules.update(facilityId, scheduleId, input, etag),
    onSuccess: (saved) => {
      // 繰り返しの回を保存すると、回は別の ID の単発の予定に置き換わり、元の回は読めなくなるので、読み直さずに捨てる
      if (saved.id !== scheduleId) {
        queryClient.removeQueries({
          queryKey: scheduleQueryOptions(api, facilityId, scheduleId).queryKey,
        })
      }
      return queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) })
    },
  })
}

/**
 * 繰り返しの予定の規則を、開いた回 scheduleId の日以降について変える（ADR-0037）。etag は、編集を開いたときに読んだ回の etag である。
 * 成功すると、開いた回の取得の結果を捨て、事業所の予定の取得の結果を捨てて取り直す。開いた回は、別の繰り返しの予定の回に替わることがある。
 */
export const useChangeRecurringRule = (scheduleId: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      recurringScheduleId,
      change,
      etag,
    }: {
      recurringScheduleId: string
      change: RecurringRuleChange
      etag: string | null
    }) => api.schedules.changeRule(facilityId, recurringScheduleId, change, etag),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: scheduleQueryOptions(api, facilityId, scheduleId).queryKey,
      })
      return queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) })
    },
  })
}

/**
 * 予定を理由 reason でキャンセルする。etag は、キャンセルのモーダルを開いたときに読んだ予定の etag で、buddy の予定では null である。
 * 成功すると、予定の 1 件の取得の結果を捨て、事業所の予定の取得の結果を捨てて取り直す。
 */
export const useCancelSchedule = (scheduleId: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reason, etag }: { reason: string; etag: string | null }) =>
      api.schedules.cancel(facilityId, scheduleId, reason, etag),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: scheduleQueryOptions(api, facilityId, scheduleId).queryKey,
      })
      return queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) })
    },
  })
}

/**
 * 誤って入れた予定を削除する mutation（ADR-0040）。回の ID を渡すと、繰り返しの予定のその回だけを削除する。
 * 成功すると、キャンセルと同じく予定の取得の結果を捨て、事業所の予定を読み直す。
 */
export const useDeleteSchedule = (scheduleId: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.schedules.delete(facilityId, scheduleId),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: scheduleQueryOptions(api, facilityId, scheduleId).queryKey,
      })
      return queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) })
    },
  })
}

/**
 * 画面を開いた時点で、事業所が予定の正本を buddy に切り替えている途中かを返す。切り替えている途中なら true である。
 * 予定の詳細と同じく、事業所の sourceMode と、カレンダーの search params の期間の予定の一覧の cutover で読む。
 * calendar_cutover_status は職員の管理の権限を求めるので使わない。buddy_primary の事業所では一覧を読まずに false にする。
 * 一覧は、cache に値があっても、画面を開いてから読み直し終えるまで待つ。切り替えをやめた後に cache の古い cutover で決めると、
 * 変えられる予定に切り替え中の文を出し続けるためである。
 * 最初に読み終えた値を保ち、開いた後に切り替えが始まっても変えない。google_primary の一覧は同期の状況のために読み直すが、
 * 開いた後の切り替えは、保存が 409 の cutover_open で拒まれて知らせ、入力を消さないためである。
 * 読み終えるまでは undefined を、事業所か一覧を読めなければ 'error' を返す。
 */
export const useCutoverAtOpen = (search: Pick<ScheduleSearch, 'view' | 'date' | 'cancelled'>) => {
  const { api, facilityId } = useBuddyApi()
  const [today] = useState(() => toDateKey(new Date()))
  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  const isGooglePrimary = facilityQuery.data?.sourceMode === 'google_primary'
  const listQuery = useQuery({
    ...scheduleListQueryOptions(api, facilityId, {
      ...getCalendarRange(resolveCalendarView(search.view), search.date ?? today),
      includeCancelled: search.cancelled,
    }),
    enabled: isGooglePrimary,
  })
  const current =
    facilityQuery.data === undefined
      ? undefined
      : !isGooglePrimary
        ? false
        : listQuery.data === undefined || !listQuery.isFetchedAfterMount || listQuery.isError
          ? undefined
          : listQuery.data.cutover !== null
  const [atOpen, setAtOpen] = useState<boolean>()
  if (atOpen === undefined && current !== undefined) setAtOpen(current)
  if (atOpen !== undefined) return atOpen
  if (current !== undefined) return current
  if (facilityQuery.isError || (isGooglePrimary && listQuery.isError)) return 'error' as const
  return undefined
}
