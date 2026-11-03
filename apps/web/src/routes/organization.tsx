import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { OrganizationListContainer } from '#/features/organization/components/OrganizationListContainer'
import { departmentsQueryOptions, teamsQueryOptions } from '#/features/organization/queries'

export const Route = createFileRoute('/organization')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer } }) =>
    awaitOnServer([
      queryClient.prefetchQuery(departmentsQueryOptions(api, viewer.facilityId)),
      queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
    ]),
  head: () => ({ meta: [{ title: '部署とチーム | buddy' }] }),
  component: OrganizationPage,
})

function OrganizationPage() {
  return <OrganizationListContainer />
}
