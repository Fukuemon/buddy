import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { StaffDetailContainer } from '#/features/staff/components/StaffDetailContainer'
import {
  policiesQueryOptions,
  positionsQueryOptions,
  staffDetailQueryOptions,
  staffListQueryOptions,
  teamsQueryOptions,
} from '#/features/staff/queries'

export const Route = createFileRoute('/staff_/$staffId')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer }, params: { staffId } }) =>
    awaitOnServer([
      queryClient.prefetchQuery(staffDetailQueryOptions(api, viewer.facilityId, staffId)),
      queryClient.prefetchQuery(staffListQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(positionsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(policiesQueryOptions(api, viewer.facilityId)),
    ]),
  head: () => ({ meta: [{ title: '職員の詳細 | buddy' }] }),
  component: StaffDetailPage,
})

function StaffDetailPage() {
  const { staffId } = Route.useParams()
  return <StaffDetailContainer key={staffId} staffId={staffId} />
}
