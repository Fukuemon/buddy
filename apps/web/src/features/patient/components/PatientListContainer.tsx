import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

import { LIST_LOAD_ERROR_MESSAGE } from '../lib/errorMessage'
import { DEFAULT_PATIENT_LIST_FILTER, assignedStaffOptions, filterPatients } from '../lib/filter'
import { patientRecordsQueryOptions, staffRecordsQueryOptions } from '../queries'
import { PatientListView, type PatientListViewState } from './PatientListView'

const PatientListContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [filter, setFilter] = useState(DEFAULT_PATIENT_LIST_FILTER)
  const records = useQuery(patientRecordsQueryOptions(api, facilityId))
  const staff = useQuery(staffRecordsQueryOptions(api, facilityId))
  const isLoading = records.isPending || staff.isPending
  const isError = records.isError || staff.isError
  const state: PatientListViewState = isError
    ? { status: 'error', message: LIST_LOAD_ERROR_MESSAGE }
    : isLoading
      ? { status: 'loading' }
      : { status: 'ready', patients: filterPatients(records.data, filter) }
  return (
    <PatientListView
      filter={filter}
      onCreate={() => navigate({ to: '/patients/new' })}
      onFilterChange={setFilter}
      onFilterClear={() => setFilter(DEFAULT_PATIENT_LIST_FILTER)}
      onRetry={() =>
        Promise.all([
          queryClient.resetQueries({ queryKey: queryKeys.patients.records(facilityId) }),
          queryClient.resetQueries({ queryKey: queryKeys.staff.records(facilityId) }),
        ])
      }
      staff={staff.data}
      staffOptions={records.data === undefined ? [] : assignedStaffOptions(records.data)}
      state={state}
    />
  )
}

/**
 * 利用者の一覧の画面。
 * 利用の終了を含む全ての利用者と、担当の職員の状態を出す職員を読み、名前の検索と絞り込みは画面で行う。
 */
export const PatientListContainer = () => {
  return <PatientListContent />
}
