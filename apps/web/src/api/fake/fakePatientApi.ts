import { mockPatients, mockServiceCodes } from '#/mocks/scheduleData'

import { ApiError, type BuddyApi } from '../client'
import { fromApiPatient } from '../http/scheduleMapper'
import { matchesName } from '../nameSearch'
import type { PatientInput, PatientRecord, PatientSchedules, Schedule, StaffRecord } from '../types'

/** createFakePatientApi の設定。 */
export type FakePatientApiOptions = {
  /** 事業所を確認する。ほかの事業所なら ApiError を投げる。 */
  assertFacility: (facilityId: string) => void
  /** 利用者の記録。フェイクの職員の操作が担当の利用者を数えるのにも使うので、呼ぶ側が作って渡す。 */
  patients: Map<PatientRecord['id'], PatientRecord>
  /** 担当の職員の名前と在籍の状態を引く、事業所の全ての職員。 */
  staff: () => Promise<readonly StaffRecord[]>
  /** 残る予定を数える、フェイクの予定。 */
  schedules: () => Iterable<Schedule>
  /** 今日。この日以降の予定を残る予定にする。 */
  today: () => Date
}

const notFound = () => new ApiError(404, '利用者が見つかりません', [], 'not_found')
const invalid = (message: string) => new ApiError(400, message, [], 'invalid_input')

const pad = (value: number) => String(value).padStart(2, '0')
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** フェイクの利用者の記録の初期値。mockPatients を写す。 */
export const createFakePatientRecords = () =>
  new Map<PatientRecord['id'], PatientRecord>(
    mockPatients.map((patient) => [patient.id, structuredClone(patient)]),
  )

/**
 * 利用者とサービスコードの操作を、メモリの上で動かす。予定の API と同じく、担当を休職か退職の職員に新しく指す操作と、
 * 無いサービスコードを指す操作は 400 で拒み、今日以降の予定が残る利用者の利用の終了は残る予定を返す。
 */
export const createFakePatientApi = ({
  assertFacility,
  patients,
  staff,
  schedules,
  today,
}: FakePatientApiOptions): Pick<BuddyApi, 'patients' | 'serviceCodes'> => {
  let sequence = 0

  const find = (id: string) => {
    const patient = patients.get(id)
    if (patient === undefined) throw notFound()
    return patient
  }
  const withCurrentStaffName = async (patient: PatientRecord): Promise<PatientRecord> => {
    const assigned = (await staff()).find((s) => s.id === patient.assigned_staff_id)
    return { ...patient, assigned_staff_name: assigned?.username ?? patient.assigned_staff_name }
  }
  /** 担当に指す職員と、サービスコードを確認する。keepStaffId の職員は、休職か退職でも通す。 */
  const resolve = async (input: PatientInput, keepStaffId?: string) => {
    const code = mockServiceCodes.find((c) => c.id === input.service_code_id)
    const assigned = (await staff()).find((s) => s.id === input.assigned_staff_id)
    if (code === undefined || assigned === undefined)
      throw invalid('サービスコードか担当の職員が見つかりません')
    if (assigned.status !== 'active' && assigned.id !== keepStaffId)
      throw invalid('休職か退職の職員は担当にできません')
    return { code, assigned }
  }
  const save = async (patient: PatientRecord) => {
    patients.set(patient.id, { ...patient, updated_at: new Date().toISOString() })
    return withCurrentStaffName(patients.get(patient.id) as PatientRecord)
  }
  const remainingOf = (patientId: string): PatientSchedules => {
    const from = localDate(today())
    return {
      schedules: [...schedules()]
        .filter(
          (s) =>
            s.visit?.patientId === patientId &&
            s.cancel === undefined &&
            s.startsAt.slice(0, 10) >= from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((s) => ({
          id: s.id,
          date: s.startsAt.slice(0, 10),
          start_time: s.startsAt.slice(11, 16),
          end_time: s.endsAt.slice(11, 16),
        })),
      recurring_schedules: [],
    }
  }
  const byName = (records: PatientRecord[]) =>
    records.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return {
    patients: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return [...patients.values()]
          .map(fromApiPatient)
          .filter((patient) => matchesName(patient.name, params))
      },
      listRecords: async (facilityId) => {
        assertFacility(facilityId)
        return byName(await Promise.all([...patients.values()].map(withCurrentStaffName)))
      },
      get: async (facilityId, patientId) => {
        assertFacility(facilityId)
        return withCurrentStaffName(find(patientId))
      },
      create: async (facilityId, input) => {
        assertFacility(facilityId)
        const { code, assigned } = await resolve(input)
        sequence += 1
        const now = new Date().toISOString()
        return save({
          id: `patient-fake-${sequence}`,
          facility_id: facilityId,
          name: input.name,
          preferred_time: input.preferred_time,
          preferred_gender: input.preferred_gender,
          service_code_id: code.id,
          service_code: code.code,
          assigned_staff_id: assigned.id,
          assigned_staff_name: assigned.username,
          ended_at: null,
          created_at: now,
          updated_at: now,
        })
      },
      update: async (facilityId, patientId, input) => {
        assertFacility(facilityId)
        const patient = find(patientId)
        const { code, assigned } = await resolve(input, patient.assigned_staff_id)
        return save({
          ...patient,
          name: input.name,
          preferred_time: input.preferred_time,
          preferred_gender: input.preferred_gender,
          service_code_id: code.id,
          service_code: code.code,
          assigned_staff_id: assigned.id,
          assigned_staff_name: assigned.username,
        })
      },
      remainingSchedules: async (facilityId, patientId) => {
        assertFacility(facilityId)
        find(patientId)
        return remainingOf(patientId)
      },
      endService: async (facilityId, patientId) => {
        assertFacility(facilityId)
        const patient = find(patientId)
        const remaining = remainingOf(patientId)
        if (remaining.schedules.length + remaining.recurring_schedules.length > 0)
          return { schedules: remaining }
        return {
          ended: await save({ ...patient, ended_at: patient.ended_at ?? new Date().toISOString() }),
        }
      },
      resumeService: async (facilityId, patientId, assignedStaffId) => {
        assertFacility(facilityId)
        const patient = find(patientId)
        const assigned = (await staff()).find((s) => s.id === assignedStaffId)
        if (assigned === undefined || assigned.status !== 'active')
          throw invalid('休職か退職の職員は担当にできません')
        return save({
          ...patient,
          ended_at: null,
          assigned_staff_id: assigned.id,
          assigned_staff_name: assigned.username,
        })
      },
    },
    serviceCodes: {
      list: async () => structuredClone(mockServiceCodes),
    },
  }
}
