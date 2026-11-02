import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import type {
  FacilityId,
  Staff,
  StaffCreateInput,
  StaffDetail,
  StaffUpdateInput,
} from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

import { policyChangeErrorReason } from './lib/errorMessage'
import type { PolicyChange } from './lib/policyChanges'

/** TanStack Query のキー。事業所ごとに分ける。職員の一覧のキーは、予定の画面の職員の一覧と分ける。 */
export const staffQueryKeys = {
  records: (facilityId: FacilityId) => ['facilities', facilityId, 'staff-records'] as const,
  detail: (facilityId: FacilityId, staffId: Staff['id']) =>
    ['facilities', facilityId, 'staff-detail', staffId] as const,
  staff: (facilityId: FacilityId) => ['facilities', facilityId, 'staff', {}] as const,
  departments: (facilityId: FacilityId) => ['facilities', facilityId, 'departments'] as const,
  teams: (facilityId: FacilityId) => ['facilities', facilityId, 'teams'] as const,
  positions: (facilityId: FacilityId) => ['facilities', facilityId, 'positions'] as const,
  policies: (facilityId: FacilityId) => ['facilities', facilityId, 'policies'] as const,
  assignments: (facilityId: FacilityId, staffId: Staff['id']) =>
    ['facilities', facilityId, 'staff-assignments', staffId] as const,
}

/** 休職と退職の職員を含む、事業所の全ての職員の query。 */
export const staffRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.records(facilityId),
    queryFn: () => api.staff.listRecords(facilityId),
  })

/** 権限の対象の名前を引く、事業所の全ての職員の query。予定の画面の職員の一覧とキャッシュを共有する。 */
export const staffListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.staff(facilityId),
    queryFn: () => api.staff.list(facilityId),
  })

/** 1 人の職員と権限の query。 */
export const staffDetailQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  staffId: Staff['id'],
) =>
  queryOptions({
    queryKey: staffQueryKeys.detail(facilityId, staffId),
    queryFn: () => api.staff.get(facilityId, staffId),
  })

/** 部署の query。 */
export const departmentsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.departments(facilityId),
    queryFn: () => api.departments.list(facilityId),
  })

/** チームの query。 */
export const teamsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.teams(facilityId),
    queryFn: () => api.teams.list(facilityId),
  })

/** 役職と、そのデフォルトの権限の query。 */
export const positionsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.positions(facilityId),
    queryFn: () => api.positions.list(facilityId),
  })

/** 8 つの権限の query。 */
export const policiesQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: staffQueryKeys.policies(facilityId),
    queryFn: () => api.policies.list(facilityId),
  })

/** 休職と退職の確認に出す、今日以降に残る予定と担当の利用者の query。開くたびに読み直す。 */
export const assignmentsQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  staffId: Staff['id'],
) =>
  queryOptions({
    queryKey: staffQueryKeys.assignments(facilityId, staffId),
    queryFn: () => api.staff.remainingAssignments(facilityId, staffId),
    gcTime: 0,
  })

/**
 * 職員を変えた後に、返った職員で詳細を置き換え、職員の一覧を読み直す。
 * 予定の画面の職員の一覧も、名前と在籍の状態が変わるので読み直す。
 */
const useStaffChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return (staff: StaffDetail) => {
    queryClient.setQueryData(staffQueryKeys.detail(facilityId, staff.id), staff)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.records(facilityId) }),
      queryClient.invalidateQueries({ queryKey: ['facilities', facilityId, 'staff'] }),
    ])
  }
}

/** 職員を登録する mutation。 */
export const useCreateStaff = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (input: StaffCreateInput) => api.staff.create(facilityId, input),
    onSuccess: changed,
  })
}

/** 職員の名前、電話番号、部署、チーム、訪問するかを変える mutation。予定か担当の利用者が残って拒まれたときは、残るものを結果に持つ。 */
export const useUpdateStaff = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (input: StaffUpdateInput) => api.staff.update(facilityId, staffId, input),
    onSuccess: (result) => ('updated' in result ? changed(result.updated) : undefined),
  })
}

/** 職員の役職を変える mutation。 */
export const useChangePosition = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (positionId: string) => api.staff.changePosition(facilityId, staffId, positionId),
    onSuccess: changed,
  })
}

/** 権限の保存で変えられなかった変更と、その理由。 */
export type PolicySaveFailure = { name: string; reason: string }

/**
 * 権限の変更を 1 つずつ送り、終わったら職員を読み直す mutation。変えられなかった変更は、理由とともに結果に返す。
 * 最初の変更が予定の API に届かなければ、何も変えずに Error を投げる。
 */
export const useSavePolicies = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: readonly PolicyChange[]) => {
      const failures: PolicySaveFailure[] = []
      for (const [index, change] of changes.entries()) {
        try {
          if (change.kind === 'remove')
            await api.staff.removePolicy(facilityId, staffId, change.userPolicyId)
          else await api.staff.addPolicy(facilityId, staffId, change.input)
        } catch (error) {
          if (index === 0 && !(error instanceof ApiError)) throw error
          failures.push({ name: change.name, reason: policyChangeErrorReason(error) })
        }
      }
      return failures
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: staffQueryKeys.detail(facilityId, staffId) }),
        queryClient.invalidateQueries({ queryKey: staffQueryKeys.records(facilityId) }),
      ]),
  })
}

/** 職員を休職にする mutation。引数は戻る予定の日（YYYY-MM-DD）で、無ければ null である。 */
export const useStartLeave = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (returnDate: string | null) =>
      api.staff.startLeave(facilityId, staffId, returnDate),
    onSuccess: changed,
  })
}

/** 休職の職員を復職にする mutation。 */
export const useReinstate = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: () => api.staff.reinstate(facilityId, staffId),
    onSuccess: changed,
  })
}

/** 職員を退職にする mutation。予定か担当の利用者が残って拒まれたときは、残るものを結果に持つ。 */
export const useRetire = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: () => api.staff.retire(facilityId, staffId),
    onSuccess: (result) => ('retired' in result ? changed(result.retired) : undefined),
  })
}
