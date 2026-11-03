import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import type { FacilityId, Patient, PatientInput, PatientRecord, Staff } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

/** 事業所の全ての利用者を、利用の終了の利用者も含め、サービス、希望、担当の職員とともに名前の順で読む query。利用者の管理の画面の一覧に使う。 */
export const patientRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.patients.records(facilityId),
    queryFn: () => api.patients.listRecords(facilityId),
  })

/** 利用者を読む query。ほかの事業所の利用者を指すと status が 403 の、見つからなければ 404 の ApiError を error に持つ。 */
export const patientDetailQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  patientId: Patient['id'],
) =>
  queryOptions({
    queryKey: queryKeys.patients.detail(facilityId, patientId),
    queryFn: () => api.patients.get(facilityId, patientId),
  })

/** サービスコードを、予定の API の並びで読む query。サービスコードは事業所ごとに変わらない。 */
export const serviceCodesQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.serviceCodes(facilityId),
    queryFn: () => api.serviceCodes.list(facilityId),
  })

/** 担当の職員の在籍の状態を引き、担当の候補を出す、休職と退職を含む事業所の全ての職員の query。 */
export const staffRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.staff.records(facilityId),
    queryFn: () => api.staff.listRecords(facilityId),
  })

/** 利用の終了の確認に出す、今日以降に残る予定の query。開くたびに読み直す。 */
export const remainingSchedulesQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  patientId: Patient['id'],
) =>
  queryOptions({
    queryKey: queryKeys.patients.remaining(facilityId, patientId),
    queryFn: () => api.patients.remainingSchedules(facilityId, patientId),
    gcTime: 0,
  })

const usePatientChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return (patient: PatientRecord) => {
    queryClient.setQueryData(queryKeys.patients.detail(facilityId, patient.id), patient)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.records(facilityId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all(facilityId) }),
    ])
  }
}

/**
 * 登録と保存が 400 で拒まれたときに、送った担当の職員が休職か退職になったかを、職員を読み直して返す。
 * 読み直せなければ false にする。
 */
export const useIsStaffStopped = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return async (error: unknown, staffId: Staff['id']) => {
    if (!(error instanceof ApiError) || error.status !== 400) return false
    try {
      const staff = await queryClient.fetchQuery({
        ...staffRecordsQueryOptions(api, facilityId),
        staleTime: 0,
      })
      return staff.some((s) => s.id === staffId && s.status !== 'active')
    } catch {
      return false
    }
  }
}

/**
 * 利用者を登録する mutation。
 * 成功すると、返った利用者で利用者の詳細の query を置き換え、利用者の管理の一覧と、予定の画面の利用者の候補を読み直す。
 * サービスコードか担当の職員が無いときと、担当に休職か退職の職員を指したときは、status が 400 の ApiError を error に持つ。
 */
export const useCreatePatient = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (input: PatientInput) => api.patients.create(facilityId, input),
    onSuccess: changed,
  })
}

/**
 * 利用者の名前、サービス、希望、担当の職員を置き換える mutation。
 * 成功すると、返った利用者で利用者の詳細の query を置き換え、利用者の管理の一覧と、予定の画面の利用者の候補を読み直す。
 * 担当を休職か退職の職員に変えると、status が 400 の ApiError を error に持つ。今の担当のままなら拒まれない。
 */
export const useUpdatePatient = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (input: PatientInput) => api.patients.update(facilityId, patientId, input),
    onSuccess: changed,
  })
}

/**
 * 利用を終了する mutation。予定が残って拒まれたときは、残る予定を結果に持つ。
 * 終了できたときは、成功すると、返った利用者で利用者の詳細の query を置き換え、利用者の管理の一覧と、予定の画面の利用者の候補を読み直す。
 */
export const useEndService = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: () => api.patients.endService(facilityId, patientId),
    onSuccess: (result) => ('ended' in result ? changed(result.ended) : undefined),
  })
}

/**
 * 利用を再開する mutation。引数は再開の後の担当の職員である。
 * 成功すると、返った利用者で利用者の詳細の query を置き換え、利用者の管理の一覧と、予定の画面の利用者の候補を読み直す。 休職か退職の職員を指すと、status が 400 の ApiError を error に持つ。
 */
export const useResumeService = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (assignedStaffId: Staff['id']) =>
      api.patients.resumeService(facilityId, patientId, assignedStaffId),
    onSuccess: changed,
  })
}
