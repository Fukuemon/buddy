import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { StaffDetailContainer } from '#/features/staff/components/StaffDetailContainer'
import {
  policiesQueryOptions,
  positionsQueryOptions,
  staffDetailQueryOptions,
  staffListQueryOptions,
  teamsQueryOptions,
} from '#/features/staff/queries'

// `/staff` の子にすると職員の一覧の上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/staff_/$staffId')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ beforeLoad が止めるので、loader は権限を持つ職員でだけ動く。
  // viewer の型は null を含むが、root の beforeLoad がログインしていない職員をログインへ移すので、ここでは null にならない
  loader: ({ context: { api, queryClient, viewer }, params: { staffId } }) =>
    viewer === null
      ? undefined
      : awaitOnServer([
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
  return (
    <SiteLayoutContainer current="/staff" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <StaffDetailContainer key={staffId} staffId={staffId} />
      </main>
    </SiteLayoutContainer>
  )
}
