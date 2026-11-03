import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { OrganizationListContainer } from '#/features/organization/components/OrganizationListContainer'
import { departmentsQueryOptions, teamsQueryOptions } from '#/features/organization/queries'

export const Route = createFileRoute('/organization')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ beforeLoad が止めるので、loader は権限を持つ職員でだけ動く。
  // viewer の型は null を含むが、root の beforeLoad がログインしていない職員をログインへ移すので、ここでは null にならない
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer === null
      ? undefined
      : awaitOnServer([
          queryClient.prefetchQuery(departmentsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
        ]),
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
