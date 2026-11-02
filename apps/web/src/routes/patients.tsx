import { Outlet, createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { PatientListContainer } from '#/features/patient/components/PatientListContainer'
import { patientRecordsQueryOptions, staffRecordsQueryOptions } from '#/features/patient/queries'

export const Route = createFileRoute('/patients')({
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ、Container が権限が無いことを示すので、API を呼ばない
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer?.canManageStaff
      ? awaitOnServer([
          queryClient.prefetchQuery(patientRecordsQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(staffRecordsQueryOptions(api, viewer.facilityId)),
        ])
      : undefined,
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
