import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/BuddyApi'
import type { Department, FacilityId, Team, TeamInput } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

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

const useOrganizationChanged = () => {
  const { facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [
        queryKeys.departments(facilityId),
        queryKeys.teams(facilityId),
        queryKeys.staff.all(facilityId),
        queryKeys.staff.records(facilityId),
        queryKeys.staff.details(facilityId),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

/**
 * 部署を作るか、名前を変える mutation。departmentId が無ければ作る。
 * 成功すると、部署とチームと、部署とチームの名前を持つ職員の一覧と詳細の query を読み直す。
 * 同じ名前の部署があれば status が 409 の、部署が見つからなければ 404 の ApiError を error に持つ。
 */
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

/**
 * チームを作るか、名前と色を変える mutation。teamId が無ければ作る。
 * 成功すると、部署とチームと、部署とチームの名前を持つ職員の一覧と詳細の query を読み直す。
 * 同じ名前のチームがあれば status が 409 の、チームが見つからなければ 404 の ApiError を error に持つ。
 */
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
