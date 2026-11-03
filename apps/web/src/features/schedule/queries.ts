import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/BuddyApi'
import type {
  FacilityId,
  NameSearchParams,
  Schedule,
  ScheduleInput,
  ScheduleListParams,
} from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

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

/** 予定を作る。成功すると、事業所の予定の取得の結果を捨てて取り直す。 */
export const useCreateSchedule = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => api.schedules.create(facilityId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(facilityId) }),
  })
}

/** 予定を更新する。成功すると、事業所の予定の取得の結果を捨てて取り直す。 */
export const useUpdateSchedule = (scheduleId: Schedule['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => api.schedules.update(facilityId, scheduleId, input),
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
