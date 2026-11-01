import {
  mockDepartments,
  mockMe,
  mockPatients,
  mockPolicies,
  mockPositions,
  mockStaff,
  mockTeams,
} from '#/mocks/scheduleData'

import { ApiError, type BuddyApi } from '../client'
import { fromApiStaff } from '../http/scheduleMapper'
import { matchesName } from '../nameSearch'
import {
  STAFF_MANAGE,
  type Position,
  type Schedule,
  type StaffAssignments,
  type StaffDetail,
  type StaffPolicy,
} from '../types'

/** createFakeStaffApi の設定。 */
export type FakeStaffApiOptions = {
  /** 事業所を確認する。ほかの事業所なら ApiError を投げる。 */
  assertFacility: (facilityId: string) => void
  /** 残る予定を数える、フェイクの予定。 */
  schedules: () => Iterable<Schedule>
  /** ログインした職員。自分を休職と退職にできない規則に使う。 */
  viewerId: string
  /** 今日。この日以降の予定を残る予定にする。 */
  today: () => Date
}

const notFound = () => new ApiError(404, '職員が見つかりません', [], 'not_found')
const conflict = (message: string) => new ApiError(409, message, [], 'conflict')

const pad = (value: number) => String(value).padStart(2, '0')
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * 職員、部署、役職、権限の操作を、メモリの上で動かす。予定の API と同じく、職員の管理の権限を持つ最後の有効な職員を
 * 止める操作と、自分を休職と退職にする操作は 409 で拒み、予定か担当の利用者が残る職員の退職は残るものを返す。
 */
export const createFakeStaffApi = ({
  assertFacility,
  schedules,
  viewerId,
  today,
}: FakeStaffApiOptions): Pick<BuddyApi, 'staff' | 'departments' | 'positions' | 'policies'> => {
  let sequence = 0
  const nextId = (prefix: string) => {
    sequence += 1
    return `${prefix}-fake-${sequence}`
  }

  const defaultPolicies = (position: Position, teamId: string): StaffPolicy[] =>
    position.policies.map((p) => ({
      user_policy_id: nextId('user-policy'),
      policy_id: p.id,
      code: p.code,
      name: p.name,
      target_user_ids: [],
      target_team_ids: p.code.startsWith('schedule.team.') ? [teamId] : [],
    }))

  const findPosition = (id: string) => {
    const position = mockPositions.find((p) => p.id === id)
    if (position === undefined) throw new ApiError(400, '役職が見つかりません', [], 'invalid_input')
    return position
  }
  const refOf = (units: { id: string; name: string }[], id: string, label: string) => {
    const unit = units.find((u) => u.id === id)
    if (unit === undefined) throw new ApiError(400, `${label}が見つかりません`, [], 'invalid_input')
    return { id: unit.id, name: unit.name }
  }

  const details = new Map<string, StaffDetail>(
    mockStaff.map((staff) => [
      staff.id,
      staff.id === mockMe.id
        ? structuredClone(mockMe)
        : {
            ...structuredClone(staff),
            sub: null,
            policies: defaultPolicies(findPosition(staff.position.id), staff.team.id),
          },
    ]),
  )

  const find = (id: string) => {
    const staff = details.get(id)
    if (staff === undefined) throw notFound()
    return staff
  }
  const save = (staff: StaffDetail) => {
    details.set(staff.id, { ...staff, updated_at: new Date().toISOString() })
    return structuredClone(details.get(staff.id) as StaffDetail)
  }
  const assertNotRetired = (staff: StaffDetail) => {
    if (staff.status === 'retired') throw conflict('退職した職員は変えられません')
  }
  const managesStaff = (staff: StaffDetail) => staff.policies.some((p) => p.code === STAFF_MANAGE)
  /** staff が止まるか権限を失うと、職員の管理の権限を持つ有効な職員がいなくなるか。 */
  const isLastManager = (staff: StaffDetail) =>
    managesStaff(staff) &&
    ![...details.values()].some(
      (s) => s.id !== staff.id && s.status === 'active' && managesStaff(s),
    )
  const assertStoppable = (staff: StaffDetail) => {
    if (staff.id === viewerId || (staff.status === 'active' && isLastManager(staff)))
      throw conflict('自分と、職員の管理の権限を持つ最後の有効な職員は止められません')
  }

  const assignmentsOf = (staffId: string): StaffAssignments => {
    const from = localDate(today())
    return {
      schedules: [...schedules()]
        .filter(
          (s) => s.staffId === staffId && s.cancel === undefined && s.startsAt.slice(0, 10) >= from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((s) => ({
          id: s.id,
          date: s.startsAt.slice(0, 10),
          start_time: s.startsAt.slice(11, 16),
          end_time: s.endsAt.slice(11, 16),
        })),
      recurring_schedules: [],
      patients: mockPatients
        .filter((p) => p.assigned_staff_id === staffId && p.ended_at === null)
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    }
  }
  const isEmpty = (a: StaffAssignments) =>
    a.schedules.length + a.recurring_schedules.length + a.patients.length === 0

  return {
    staff: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return [...details.values()]
          .map(fromApiStaff)
          .filter((staff) => matchesName(staff.name, params))
      },
      listRecords: async (facilityId) => {
        assertFacility(facilityId)
        return [...details.values()]
          .map((detail) => {
            const { sub: _, policies: __, ...record } = structuredClone(detail)
            return record
          })
          .sort((a, b) => a.username.localeCompare(b.username, 'ja'))
      },
      get: async (facilityId, staffId) => {
        assertFacility(facilityId)
        return structuredClone(find(staffId))
      },
      create: async (facilityId, input) => {
        assertFacility(facilityId)
        const email = input.email.toLowerCase()
        if ([...details.values()].some((s) => s.email === email))
          throw conflict(`メール ${email} の職員は登録できません`)
        const position = findPosition(input.position_id)
        const now = new Date().toISOString()
        return save({
          id: nextId('staff'),
          username: input.username,
          email,
          phone_number: input.phone_number ?? null,
          facility_id: facilityId,
          department: refOf(mockDepartments, input.department_id, '部署'),
          team: refOf(mockTeams, input.team_id, 'チーム'),
          position: { id: position.id, name: position.name },
          status: 'active',
          leave_started_at: null,
          leave_return_date: null,
          retired_at: null,
          created_at: now,
          updated_at: now,
          sub: null,
          policies: defaultPolicies(position, input.team_id),
        })
      },
      update: async (facilityId, staffId, input) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        const oldTeam = staff.team.id
        return save({
          ...staff,
          username: input.username,
          phone_number: input.phone_number ?? null,
          department: refOf(mockDepartments, input.department_id, '部署'),
          team: refOf(mockTeams, input.team_id, 'チーム'),
          policies: staff.policies.map((p) => ({
            ...p,
            target_team_ids: p.target_team_ids.map((t) => (t === oldTeam ? input.team_id : t)),
          })),
        })
      },
      changePosition: async (facilityId, staffId, positionId) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        const position = findPosition(positionId)
        if (isLastManager(staff) && !position.policies.some((p) => p.code === STAFF_MANAGE))
          throw conflict('職員の管理の権限を持つ最後の有効な職員の役職は変えられません')
        return save({
          ...staff,
          position: { id: position.id, name: position.name },
          policies: defaultPolicies(position, staff.team.id),
        })
      },
      addPolicy: async (facilityId, staffId, input) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        const found = mockPolicies.find((p) => p.id === input.policy_id)
        if (found === undefined)
          throw new ApiError(400, '権限が見つかりません', [], 'invalid_input')
        if (staff.policies.some((p) => p.policy_id === found.id))
          throw conflict('同じ権限を持っています')
        return save({
          ...staff,
          policies: [
            ...staff.policies,
            {
              user_policy_id: nextId('user-policy'),
              policy_id: found.id,
              code: found.code,
              name: found.name,
              target_user_ids: input.target_user_ids ?? [],
              target_team_ids: input.target_team_ids ?? [],
            },
          ],
        })
      },
      removePolicy: async (facilityId, staffId, userPolicyId) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        const removed = staff.policies.find((p) => p.user_policy_id === userPolicyId)
        if (removed === undefined) throw notFound()
        if (removed.code === STAFF_MANAGE && staff.status === 'active' && isLastManager(staff))
          throw conflict('職員の管理の権限を持つ最後の有効な職員から、その権限は外せません')
        return save({
          ...staff,
          policies: staff.policies.filter((p) => p.user_policy_id !== userPolicyId),
        })
      },
      remainingAssignments: async (facilityId, staffId) => {
        assertFacility(facilityId)
        find(staffId)
        return assignmentsOf(staffId)
      },
      startLeave: async (facilityId, staffId, returnDate) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        assertStoppable(staff)
        return save({
          ...staff,
          status: 'on_leave',
          leave_started_at: staff.leave_started_at ?? new Date().toISOString(),
          leave_return_date: returnDate,
        })
      },
      reinstate: async (facilityId, staffId) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        return save({ ...staff, status: 'active', leave_started_at: null, leave_return_date: null })
      },
      retire: async (facilityId, staffId) => {
        assertFacility(facilityId)
        const staff = find(staffId)
        assertNotRetired(staff)
        assertStoppable(staff)
        const assignments = assignmentsOf(staffId)
        if (!isEmpty(assignments)) return { assignments }
        return {
          retired: save({
            ...staff,
            status: 'retired',
            email: null,
            phone_number: null,
            leave_started_at: null,
            leave_return_date: null,
            retired_at: new Date().toISOString(),
          }),
        }
      },
    },
    departments: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return mockDepartments.map(({ id, name }) => ({ id, name }))
      },
    },
    positions: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return structuredClone(mockPositions)
      },
    },
    policies: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return structuredClone(mockPolicies)
      },
    },
  }
}
