import { createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
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
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ、Container が権限が無いことを示すので、API を呼ばない
  loader: ({ context: { api, queryClient, viewer }, params: { staffId } }) =>
    viewer?.canManageStaff
      ? awaitOnServer([
          queryClient.prefetchQuery(staffDetailQueryOptions(api, viewer.facilityId, staffId)),
          queryClient.prefetchQuery(staffListQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(positionsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(policiesQueryOptions(api, viewer.facilityId)),
        ])
      : undefined,
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
