import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'

import { staffListQueryOptions, teamListQueryOptions } from '../queries'
import { StaffFilterSidebar } from './StaffFilterSidebar'

/** 職員とチームを取り、選んだ職員を `/schedule` の search params の staff に書く。 */
export const StaffFilterSidebarContainer = () => {
  const { staff } = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const { api, facilityId } = useBuddyApi()

  const teamsQuery = useQuery(teamListQueryOptions(api, facilityId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))

  return (
    <StaffFilterSidebar
      onChange={(staffIds) => navigate({ search: (prev) => ({ ...prev, staff: staffIds }) })}
      selectedStaffIds={staff}
      staffList={staffQuery.data ?? []}
      teams={teamsQuery.data ?? []}
    />
  )
}
