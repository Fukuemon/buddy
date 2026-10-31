import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'

/**
 * 予定の API の利用者の登録（POST /v1/facilities/{facility_id}/patients）を token の職員で呼び、レスポンスを返す。
 * 担当の職員は assignedStaffId にし、サービスコードはサービスコードの一覧（listServiceCodes）の最初のものにする。
 */
export const registerPatient = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  patient: { name: string; assignedStaffId: string },
) => {
  const headers = { Authorization: `Bearer ${token}` }
  const res = await request.get(`${SCHEDULE_URL}/v1/visit_infos/service_codes`, { headers })
  if (!res.ok()) throw new Error(`サービスコードの一覧を取れない: ${res.status()}`)
  const [code] = (await res.json()) as { id: string }[]
  if (code === undefined) throw new Error('サービスコードが無い')
  return request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/patients`, {
    headers,
    data: {
      name: patient.name,
      preferred_time: '午前',
      preferred_gender: '女性',
      service_code_id: code.id,
      assigned_staff_id: patient.assignedStaffId,
    },
  })
}

/** 予定の API の利用の終了（POST /v1/patients/{patient_id}/end_service）を token の職員で呼び、レスポンスを返す。 */
export const endPatientService = (request: APIRequestContext, token: string, patientId: string) =>
  request.post(`${SCHEDULE_URL}/v1/patients/${patientId}/end_service`, {
    headers: { Authorization: `Bearer ${token}` },
  })
