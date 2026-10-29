import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'

import { exportIssueListQueryOptions } from '../queries'
import { CalendarHeaderTools } from './CalendarHeaderTools'

/** 職員の管理の権限を持つ職員にだけ、ヘッダーの取り込みと要確認のボタンを出す。件数は、確認が必要な予定の画面と同じ一覧から数える。 */
export const CalendarHeaderToolsContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff === true ? <CalendarHeaderToolsContent /> : null
}

const CalendarHeaderToolsContent = () => {
  const { api, facilityId } = useBuddyApi()
  const issuesQuery = useQuery(exportIssueListQueryOptions(api, facilityId))
  return <CalendarHeaderTools reviewCount={issuesQuery.data?.length} />
}
