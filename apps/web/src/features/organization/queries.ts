import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/BuddyApi'
import type { Department, FacilityId, Team, TeamInput } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

/** TanStack Query のキー。職員の画面と予定の画面の部署とチームと、同じキャッシュを使う。 */
export const organizationQueryKeys = {
  departments: (facilityId: FacilityId) => ['facilities', facilityId, 'departments'] as const,
  teams: (facilityId: FacilityId) => ['facilities', facilityId, 'teams'] as const,
}

/** 事業所の部署の query。 */
export const departmentsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: organizationQueryKeys.departments(facilityId),
    queryFn: () => api.departments.list(facilityId),
  })

/** 事業所のチームの query。 */
export const teamsQueryOptions = (api: BuddyApi, facilityId: FacilityId) =>
  queryOptions({
    queryKey: organizationQueryKeys.teams(facilityId),
    queryFn: () => api.teams.list(facilityId),
  })

/**
 * 部署かチームを変えた後に、部署とチームを読み直す。
 * 職員の画面と予定の画面の職員も、部署とチームの名前を持つので読み直す。
 */
const useOrganizationChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['departments', 'teams', 'staff', 'staff-records', 'staff-detail'].map((key) =>
        queryClient.invalidateQueries({ queryKey: ['facilities', facilityId, key] }),
      ),
    )
}

/** 部署を作るか、名前を変える mutation。departmentId が無ければ作る。 */
export const useSaveDepartment = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = useOrganizationChanged()
  return useMutation({
    mutationFn: ({ departmentId, name }: { departmentId?: Department['id']; name: string }) =>
      departmentId === undefined
        ? api.departments.create(facilityId, name)
        : api.departments.update(facilityId, departmentId, name),
    onSuccess: changed,
  })
}

/** チームを作るか、名前と色を変える mutation。teamId が無ければ作る。 */
export const useSaveTeam = () => {
  const { api, facilityId } = useBuddyApi()
  const changed = useOrganizationChanged()
  return useMutation({
    mutationFn: ({ teamId, input }: { teamId?: Team['id']; input: TeamInput }) =>
      teamId === undefined
        ? api.teams.create(facilityId, input)
        : api.teams.update(facilityId, teamId, input),
    onSuccess: changed,
  })
}
