import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
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
    <>
      <PatientListContainer />
      <Outlet />
    </>
  )
}
