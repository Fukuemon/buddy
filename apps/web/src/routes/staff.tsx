import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { StaffListContainer } from '#/features/staff/components/StaffListContainer'
import {
  departmentsQueryOptions,
  positionsQueryOptions,
  staffRecordsQueryOptions,
  teamsQueryOptions,
} from '#/features/staff/queries'

export const Route = createFileRoute('/staff')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer } }) =>
    awaitOnServer([
      queryClient.prefetchQuery(staffRecordsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(departmentsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(positionsQueryOptions(api, viewer.facilityId)),
    ]),
  head: () => ({ meta: [{ title: '職員 | buddy' }] }),
  component: StaffPage,
})

function StaffPage() {
  return (
    <>
      <StaffListContainer />
      <Outlet />
    </>
  )
}
