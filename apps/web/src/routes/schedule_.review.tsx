import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'
import { exportIssueListQueryOptions } from '#/features/calendar/queries'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/review')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ beforeLoad が止めるので、loader は権限を持つ職員でだけ動く。
  // viewer の型は null を含むが、root の beforeLoad がログインしていない職員をログインへ移すので、ここでは null にならない
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer === null
      ? undefined
      : awaitOnServer([
          queryClient.prefetchQuery(exportIssueListQueryOptions(api, viewer.facilityId)),
        ]),
  head: () => ({ meta: [{ title: '確認が必要な予定 | buddy' }] }),
  component: CalendarReviewPage,
})

function CalendarReviewPage() {
  return (
    <SiteLayoutContainer current="/schedule/review" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarReviewContainer />
      </main>
    </SiteLayoutContainer>
  )
}
