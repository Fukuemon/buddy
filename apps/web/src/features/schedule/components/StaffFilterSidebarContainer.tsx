import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'

import { activeStaff, activeStaffIds } from '../lib/activeStaff'
import { staffListQueryOptions, teamListQueryOptions } from '../queries'
import { StaffFilterSidebar } from './StaffFilterSidebar'

/** 職員とチームを取り、止めた職員を除いて出し、選んだ職員を `/schedule` の search params の staff に書く。 */
export const StaffFilterSidebarContainer = () => {
  const { staff } = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const { api, facilityId } = useBuddyApi()
  const { viewer } = useRouteContext({ from: '__root__' })

  const teamsQuery = useQuery(teamListQueryOptions(api, facilityId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))

  return (
    <StaffFilterSidebar
      onChange={(staffIds) => navigate({ search: (prev) => ({ ...prev, staff: staffIds }) })}
      selectedStaffIds={activeStaffIds(staff, staffQuery.data)}
      staffList={activeStaff(staffQuery.data ?? [])}
      teams={teamsQuery.data ?? []}
      viewerStaffId={viewer?.staffId}
    />
  )
}
