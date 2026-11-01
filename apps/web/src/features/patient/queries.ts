import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi } from '#/api/client'
import type { FacilityId, PatientInput, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

/**
 * TanStack Query のキー。事業所ごとに分ける。利用者の一覧のキーは、予定の画面の利用者の候補と分ける。
 * 職員の一覧のキーは、職員の管理の画面と同じにし、キャッシュを共有する。
 */
export const patientQueryKeys = {
  records: (facilityId: FacilityId) => ['facilities', facilityId, 'patient-records'] as const,
  serviceCodes: (facilityId: FacilityId) => ['facilities', facilityId, 'service-codes'] as const,
  staffRecords: (facilityId: FacilityId) => ['facilities', facilityId, 'staff-records'] as const,
}

/** 利用の終了の利用者を含む、事業所の全ての利用者の query。 */
export const patientRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: patientQueryKeys.records(facilityId),
    queryFn: () => api.patients.listRecords(facilityId),
  })

/** サービスコードの query。 */
export const serviceCodesQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: patientQueryKeys.serviceCodes(facilityId),
    queryFn: () => api.serviceCodes.list(facilityId),
  })

/** 担当の職員の在籍の状態を引き、担当の候補を出す、休職と退職を含む事業所の全ての職員の query。 */
export const staffRecordsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: patientQueryKeys.staffRecords(facilityId),
    queryFn: () => api.staff.listRecords(facilityId),
  })

/**
 * 利用者を変えた後に、利用者の一覧と、予定の画面の利用者の候補を読み直す。
 */
const usePatientChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: patientQueryKeys.records(facilityId) }),
      queryClient.invalidateQueries({ queryKey: ['facilities', facilityId, 'patients'] }),
    ])
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
