import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { PatientDetailContainer } from '#/features/patient/components/PatientDetailContainer'
import {
  patientDetailQueryOptions,
  serviceCodesQueryOptions,
  staffRecordsQueryOptions,
} from '#/features/patient/queries'

export const Route = createFileRoute('/patients_/$patientId')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer }, params: { patientId } }) =>
    awaitOnServer([
      queryClient.prefetchQuery(patientDetailQueryOptions(api, viewer.facilityId, patientId)),
      queryClient.prefetchQuery(staffRecordsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(serviceCodesQueryOptions(api, viewer.facilityId)),
    ]),
  head: () => ({ meta: [{ title: '利用者の詳細 | buddy' }] }),
  component: PatientDetailPage,
})

function PatientDetailPage() {
  const { patientId } = Route.useParams()
  return <PatientDetailContainer key={patientId} patientId={patientId} />
}
