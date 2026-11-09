import { createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { requirePermission } from '#/api/permissions'
import { awaitOnServer } from '#/api/prefetch'
import { AccountProfileContainer } from '#/features/staff/components/AccountProfileContainer'
import {
  meQueryOptions,
  myExternalCalendarQueryOptions,
  staffListQueryOptions,
  teamsQueryOptions,
} from '#/features/staff/queries'

export const Route = createFileRoute('/me')({
  beforeLoad: requirePermission('none'),
  ssr: RENDER_DATA_ON_SERVER,
  // 権限を求めないので beforeLoad は viewer の null を外さない。未ログインは root の route がログインへ移す
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer === null
      ? undefined
      : awaitOnServer([
          queryClient.prefetchQuery(meQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(myExternalCalendarQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(staffListQueryOptions(api, viewer.facilityId)),
          queryClient.prefetchQuery(teamsQueryOptions(api, viewer.facilityId)),
        ]),
  head: () => ({ meta: [{ title: '自分の情報 | buddy' }] }),
  component: AccountProfileContainer,
})
