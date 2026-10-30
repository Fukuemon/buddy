import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'

import { exportIssueListQueryOptions } from '../queries'
import { CalendarReviewBadge } from './CalendarReviewBadge'

/** 職員の管理の権限を持つ職員にだけ、要確認の件数の印を出す。件数は、確認が必要な予定の画面と同じ一覧から数える。 */
export const CalendarReviewBadgeContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff === true ? <CalendarReviewBadgeContent /> : null
}

const CalendarReviewBadgeContent = () => {
  const { api, facilityId } = useBuddyApi()
  const issuesQuery = useQuery(exportIssueListQueryOptions(api, facilityId))
  return <CalendarReviewBadge reviewCount={issuesQuery.data?.length} />
}
