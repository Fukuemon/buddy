import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/client'
import type {
  FacilityId,
  NameSearchParams,
  Schedule,
  ScheduleInput,
  ScheduleListParams,
} from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

/** TanStack Query のキー。事業所ごとに分ける。 */
const queryKeys = {
  schedules: (facilityId: FacilityId) => ['facilities', facilityId, 'schedules'] as const,
  staff: (facilityId: FacilityId) => ['facilities', facilityId, 'staff'] as const,
  teams: (facilityId: FacilityId) => ['facilities', facilityId, 'teams'] as const,
  patients: (facilityId: FacilityId) => ['facilities', facilityId, 'patients'] as const,
}

/** 期間と職員で絞った、事業所の予定の一覧の query。 */
export const scheduleListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: ScheduleListParams,
) =>
  queryOptions({
    queryKey: [...queryKeys.schedules(facilityId), 'list', params],
    queryFn: () => api.schedules.list(facilityId, params),
  })

/** 予定 1 件の query。 */
export const scheduleQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  scheduleId: Schedule['id'],
) =>
  queryOptions({
    queryKey: [...queryKeys.schedules(facilityId), 'detail', scheduleId],
    queryFn: () => api.schedules.get(facilityId, scheduleId),
  })

/** 名前で絞った、事業所の職員の一覧の query。 */
export const staffListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: NameSearchParams = {},
) =>
  queryOptions({
    queryKey: [...queryKeys.staff(facilityId), params],
    queryFn: () => api.staff.list(facilityId, params),
  })

/** 事業所のチームの一覧の query。チームは名前で絞らず、全件を取る。 */
export const teamListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.teams(facilityId),
    queryFn: () => api.teams.list(facilityId),
  })

/** 名前で絞った、事業所の利用者の一覧の query。 */
export const patientListQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  params: NameSearchParams = {},
) =>
  queryOptions({
    queryKey: [...queryKeys.patients(facilityId), params],
    queryFn: () => api.patients.list(facilityId, params),
  })

/** 予定を作る。成功すると、事業所の予定の取得の結果を捨てて取り直す。 */
export const useCreateSchedule = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => api.schedules.create(facilityId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.schedules(facilityId) }),
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
      return queryClient.invalidateQueries({ queryKey: queryKeys.schedules(facilityId) })
    },
  })
}
