import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

import { LIST_LOAD_ERROR_MESSAGE } from '../lib/errorMessage'
import { DEFAULT_STAFF_LIST_FILTER, filterStaff } from '../lib/filter'
import {
  departmentsQueryOptions,
  positionsQueryOptions,
  staffRecordsQueryOptions,
  teamsQueryOptions,
} from '../queries'
import { StaffListView, type StaffListViewState } from './StaffListView'

const StaffListContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [filter, setFilter] = useState(DEFAULT_STAFF_LIST_FILTER)
  const records = useQuery(staffRecordsQueryOptions(api, facilityId))
  const departments = useQuery(departmentsQueryOptions(api, facilityId))
  const teams = useQuery(teamsQueryOptions(api, facilityId))
  const positions = useQuery(positionsQueryOptions(api, facilityId))
  const state: StaffListViewState = records.isPending
    ? { status: 'loading' }
    : records.isError
      ? { status: 'error', message: LIST_LOAD_ERROR_MESSAGE }
      : { status: 'ready', staffList: filterStaff(records.data, filter, teams.data) }
  return (
    <StaffListView
      departments={departments.data}
      filter={filter}
      onCreate={() => navigate({ to: '/staff/new' })}
      onFilterChange={setFilter}
      onFilterClear={() => setFilter(DEFAULT_STAFF_LIST_FILTER)}
      onRetry={() => queryClient.resetQueries({ queryKey: queryKeys.staff.records(facilityId) })}
      positions={positions.data}
      state={state}
      teams={teams.data}
    />
  )
}

/**
 * 職員の一覧の画面。
 * 全ての職員と絞り込みの選択肢を読み、名前の検索と絞り込みは画面で行う。
 */
export const StaffListContainer = () => {
  return <StaffListContent />
}
