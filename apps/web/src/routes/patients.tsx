import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { PatientListContainer } from '#/features/patient/components/PatientListContainer'
import { patientRecordsQueryOptions, staffRecordsQueryOptions } from '#/features/patient/queries'

export const Route = createFileRoute('/patients')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer } }) =>
    awaitOnServer([
      queryClient.prefetchQuery(patientRecordsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(staffRecordsQueryOptions(api, viewer.facilityId)),
    ]),
  head: () => ({ meta: [{ title: '利用者 | buddy' }] }),
  component: PatientsPage,
})

function PatientsPage() {
  return (
    <SiteLayoutContainer current="/patients" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <PatientListContainer />
      </main>
      <Outlet />
    </SiteLayoutContainer>
  )
}
