import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/permissions'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'
import { exportIssueListQueryOptions } from '#/features/calendar/queries'

export const Route = createFileRoute('/schedule_/review')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer } }) =>
    awaitOnServer([queryClient.prefetchQuery(exportIssueListQueryOptions(api, viewer.facilityId))]),
  head: () => ({ meta: [{ title: '確認が必要な予定 | buddy' }] }),
  component: CalendarReviewPage,
})

function CalendarReviewPage() {
  return <CalendarReviewContainer />
}
