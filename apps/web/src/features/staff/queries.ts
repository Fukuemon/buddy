import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import type {
  FacilityId,
  Staff,
  StaffCreateInput,
  StaffDetail,
  StaffUpdateInput,
} from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'
import { useRefreshViewer } from '#/api/viewer'

import { policyChangeErrorReason } from './lib/errorMessage'
import type { PolicyChange } from './lib/policyChanges'

/** 事業所の全ての職員を、休職と退職の職員も含め、部署、チーム、役職、在籍の状態とともに名前の順で読む query。職員の管理の画面の一覧に使う。 */
export const staffRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.staff.records(facilityId),
    queryFn: () => api.staff.listRecords(facilityId),
  })

/** 権限の対象の名前を引く、事業所の全ての職員の query。予定の画面の職員の一覧とキャッシュを共有する。 */
export const staffListQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.staff.list(facilityId),
    queryFn: () => api.staff.list(facilityId),
  })

/** 職員と、その職員の権限を読む query。ほかの事業所の職員を指すと、status が 403 の ApiError を error に持つ。 */
export const staffDetailQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  staffId: Staff['id'],
) =>
  queryOptions({
    queryKey: queryKeys.staff.detail(facilityId, staffId),
    queryFn: () => api.staff.get(facilityId, staffId),
  })

/** 事業所の全ての部署を読む query。部署とチームの mutation が成功すると読み直す。 */
export const departmentsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.departments(facilityId),
    queryFn: () => api.departments.list(facilityId),
  })

/** 事業所の全てのチームを、色とともに読む query。部署とチームの mutation が成功すると読み直す。 */
export const teamsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.teams(facilityId),
    queryFn: () => api.teams.list(facilityId),
  })

/** 役職を、そのデフォルトの権限とともに名前の順で読む query。 */
export const positionsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.positions(facilityId),
    queryFn: () => api.positions.list(facilityId),
  })

/** 職員に付けられる全ての権限を読む query。権限は事業所ごとに変わらない。 */
export const policiesQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.policies(facilityId),
    queryFn: () => api.policies.list(facilityId),
  })

/** 休職と退職の確認に出す、今日以降に残る予定と担当の利用者の query。開くたびに読み直す。 */
export const assignmentsQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  staffId: Staff['id'],
) =>
  queryOptions({
    queryKey: queryKeys.staff.assignments(facilityId, staffId),
    queryFn: () => api.staff.remainingAssignments(facilityId, staffId),
    gcTime: 0,
  })

const useStaffChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return (staff: StaffDetail) => {
    queryClient.setQueryData(queryKeys.staff.detail(facilityId, staff.id), staff)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.records(facilityId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all(facilityId) }),
    ])
  }
}

/**
 * 職員を登録し、役職のデフォルトの権限を付ける mutation。
 * 成功すると、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。
 * 同じメールアドレスの職員がいれば status が 409 の、部署、チーム、役職が無ければ 400 の ApiError を error に持つ。
 */
export const useCreateStaff = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (input: StaffCreateInput) => api.staff.create(facilityId, input),
    onSuccess: changed,
  })
}

/**
 * 職員の名前、電話番号、部署、チーム、訪問するかを変える mutation。予定か担当の利用者が残って拒まれたときは、残るものを結果に持つ。
 * 変えられたときは、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。ログインした職員の情報（viewer）も読み直す。
 * 退職した職員では、status が 409 の ApiError を error に持つ。
 */
export const useUpdateStaff = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  const refreshViewer = useRefreshViewer()
  return useMutation({
    mutationFn: (input: StaffUpdateInput) => api.staff.update(facilityId, staffId, input),
    onSuccess: (result) =>
      'updated' in result ? Promise.all([changed(result.updated), refreshViewer()]) : undefined,
  })
}

/**
 * 職員の役職を変え、権限を新しい役職のデフォルトの権限に置き換える mutation。
 * 成功すると、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。ログインした職員の情報（viewer）も読み直す。
 * 職員の管理の権限を持つ最後の有効な職員から、その権限を外す役職には変えられず、status が 409 の ApiError を error に持つ。
 */
export const useChangePosition = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  const refreshViewer = useRefreshViewer()
  return useMutation({
    mutationFn: (positionId: string) => api.staff.changePosition(facilityId, staffId, positionId),
    onSuccess: (staff) => Promise.all([changed(staff), refreshViewer()]),
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
  const refreshViewer = useRefreshViewer()
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
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(facilityId, staffId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.records(facilityId) }),
        refreshViewer(),
      ]),
  })
}

/**
 * 職員を休職にする mutation。引数は戻る予定の日（YYYY-MM-DD）で、無ければ null である。
 * 成功すると、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。
 * 自分、職員の管理の権限を持つ最後の有効な職員、退職した職員では、status が 409 の ApiError を error に持つ。
 */
export const useStartLeave = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: (returnDate: string | null) =>
      api.staff.startLeave(facilityId, staffId, returnDate),
    onSuccess: changed,
  })
}

/**
 * 休職の職員を復職にする mutation。
 * 成功すると、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。
 * 一覧の読み直しは待たずに決着させる。職員の詳細は「…」のメニューを決着で閉じるので、待つと復職の後の項目を出したまま開いている。
 * 退職した職員では、status が 409 の ApiError を error に持つ。
 */
export const useReinstate = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: () => api.staff.reinstate(facilityId, staffId),
    onSuccess: (staff) => {
      void changed(staff)
    },
  })
}

/**
 * 職員を退職にする mutation。予定か担当の利用者が残って拒まれたときは、残るものを結果に持つ。
 * 退職にできたときは、返った職員で職員の詳細の query を置き換え、職員の管理の一覧と、予定の画面の職員の一覧を読み直す。
 * 自分か、職員の管理の権限を持つ最後の有効な職員では、status が 409 の ApiError を error に持つ。
 */
export const useRetire = (staffId: Staff['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = useStaffChanged()
  return useMutation({
    mutationFn: () => api.staff.retire(facilityId, staffId),
    onSuccess: (result) => ('retired' in result ? changed(result.retired) : undefined),
  })
}

/** ログインした職員と、持っている権限を読む query。 */
export const meQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.me.detail(facilityId),
    queryFn: () => api.me.get(facilityId),
  })

/** ログインした職員に結び付いたカレンダーを読む query。結び付いていなければ data は null である。 */
export const myExternalCalendarQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.me.calendar(facilityId),
    queryFn: () => api.me.externalCalendar(facilityId),
  })
