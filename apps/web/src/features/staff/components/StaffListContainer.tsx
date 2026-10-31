import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/site/PageForbiddenMessage'

import { LIST_LOAD_ERROR_MESSAGE } from '../lib/errorMessage'
import { staffQueryKeys, staffRecordsQueryOptions } from '../queries'
import { StaffListView, type StaffListViewState } from './StaffListView'

const StaffListContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const query = useQuery(staffRecordsQueryOptions(api, facilityId))
  const state: StaffListViewState = query.isPending
    ? { status: 'loading' }
    : query.isError
      ? { status: 'error', message: LIST_LOAD_ERROR_MESSAGE }
      : { status: 'ready', staff: query.data }
  return (
    <StaffListView
      onCreate={() => navigate({ to: '/staff/new' })}
      onRetry={() => queryClient.resetQueries({ queryKey: staffQueryKeys.records(facilityId) })}
      state={state}
    />
  )
}

/** 職員の一覧の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。 */
export const StaffListContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <StaffListContent /> : <PageForbiddenMessage />
}
