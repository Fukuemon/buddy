import { createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { OrganizationListContainer } from '#/features/organization/components/OrganizationListContainer'
import { departmentsQueryOptions, teamsQueryOptions } from '#/features/organization/queries'

export const Route = createFileRoute('/organization')({
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ、Container が権限が無いことを示すので、API を呼ばない
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer?.canManageStaff
      ? awaitOnServer([
          queryClient.prefetchQuery(departmentsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
        ])
      : undefined,
  head: () => ({ meta: [{ title: '部署とチーム | buddy' }] }),
  component: OrganizationPage,
})

function OrganizationPage() {
  return (
    <SiteLayoutContainer current="/organization" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <OrganizationListContainer />
      </main>
    </SiteLayoutContainer>
  )
}
