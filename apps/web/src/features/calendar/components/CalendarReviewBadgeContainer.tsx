import { useQuery } from '@tanstack/react-query'

import { STAFF_MANAGE } from '#/api/permissions'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PermissionGuard } from '#/components/PermissionGuard'

import { exportIssueListQueryOptions } from '../queries'
import { CalendarReviewBadge } from './CalendarReviewBadge'

/** 職員の管理の権限を持つ職員にだけ、要確認の件数の印を出す。件数は、確認が必要な予定の画面と同じ一覧から数える。 */
export const CalendarReviewBadgeContainer = () => {
  return (
    <PermissionGuard permission={STAFF_MANAGE}>
      <CalendarReviewBadgeContent />
    </PermissionGuard>
  )
}

const CalendarReviewBadgeContent = () => {
  const { api, facilityId } = useBuddyApi()
  const issuesQuery = useQuery(exportIssueListQueryOptions(api, facilityId))
  return <CalendarReviewBadge reviewCount={issuesQuery.data?.length} />
}
