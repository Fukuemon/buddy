import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import type { FacilityId, Patient, PatientInput, PatientRecord, Staff } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

/** 利用の終了の利用者を含む、事業所の全ての利用者の query。 */
export const patientRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: queryKeys.patients.records(facilityId),
    queryFn: () => api.patients.listRecords(facilityId),
  })

/** 1 人の利用者の query。 */
export const patientDetailQueryOptions = (
  api: BuddyApi,
  facilityId: FacilityId,
  patientId: Patient['id'],
) =>
  queryOptions({
    queryKey: queryKeys.patients.detail(facilityId, patientId),
    queryFn: () => api.patients.get(facilityId, patientId),
  })

/** サービスコードの query。 */
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

/**
 * 利用者を変えた後に、返った利用者で詳細を置き換え、利用者の一覧と、予定の画面の利用者の候補を読み直す。
 */
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

/** 利用者を登録する mutation。 */
export const useCreatePatient = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (input: PatientInput) => api.patients.create(facilityId, input),
    onSuccess: changed,
  })
}

/** 利用者の名前、サービス、希望、担当の職員を変える mutation。 */
export const useUpdatePatient = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (input: PatientInput) => api.patients.update(facilityId, patientId, input),
    onSuccess: changed,
  })
}

/** 利用を終了する mutation。予定が残って拒まれたときは、残る予定を結果に持つ。 */
export const useEndService = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: () => api.patients.endService(facilityId, patientId),
    onSuccess: (result) => ('ended' in result ? changed(result.ended) : undefined),
  })
}

/** 利用を再開する mutation。引数は再開の後の担当の職員である。 */
export const useResumeService = (patientId: Patient['id']) => {
  const { api, facilityId } = useBuddyApi()
  const changed = usePatientChanged()
  return useMutation({
    mutationFn: (assignedStaffId: Staff['id']) =>
      api.patients.resumeService(facilityId, patientId, assignedStaffId),
    onSuccess: changed,
  })
}
