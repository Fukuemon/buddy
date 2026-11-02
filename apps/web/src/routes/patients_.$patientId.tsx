import { createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { PatientDetailContainer } from '#/features/patient/components/PatientDetailContainer'
import {
  patientDetailQueryOptions,
  serviceCodesQueryOptions,
  staffRecordsQueryOptions,
} from '#/features/patient/queries'

// `/patients` の子にすると利用者の一覧の上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/patients_/$patientId')({
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ、Container が権限が無いことを示すので、API を呼ばない
  loader: ({ context: { api, queryClient, viewer }, params: { patientId } }) =>
    viewer?.canManageStaff
      ? awaitOnServer([
          queryClient.prefetchQuery(patientDetailQueryOptions(api, viewer.facilityId, patientId)),
          queryClient.prefetchQuery(staffRecordsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(serviceCodesQueryOptions(api, viewer.facilityId)),
        ])
      : undefined,
  head: () => ({ meta: [{ title: '利用者の詳細 | buddy' }] }),
  component: PatientDetailPage,
})

function PatientDetailPage() {
  const { patientId } = Route.useParams()
  return (
    <SiteLayoutContainer current="/patients" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <PatientDetailContainer key={patientId} patientId={patientId} />
      </main>
    </SiteLayoutContainer>
  )
}
