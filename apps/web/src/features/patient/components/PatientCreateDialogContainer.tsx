import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { STAFF_MANAGE } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PermissionGuard } from '#/components/PermissionGuard'

import { OPTIONS_LOAD_ERROR_MESSAGE, patientSubmitErrorMessage } from '../lib/errorMessage'
import { activeStaffOptions } from '../lib/format'
import {
  serviceCodesQueryOptions,
  staffRecordsQueryOptions,
  useCreatePatient,
  useIsStaffStopped,
} from '../queries'
import { PatientCreateDialog } from './PatientCreateDialog'

const PatientCreateDialogContent = () => {
  const { api, facilityId } = useBuddyApi()
  const navigate = useNavigate()
  const serviceCodes = useQuery(serviceCodesQueryOptions(api, facilityId))
  const staff = useQuery(staffRecordsQueryOptions(api, facilityId))
  const create = useCreatePatient()
  const isStaffStopped = useIsStaffStopped()
  const [staffStopped, setStaffStopped] = useState(false)
  const optionsFailed = serviceCodes.isError || staff.isError

  return (
    <PatientCreateDialog
      errorMessage={
        optionsFailed
          ? OPTIONS_LOAD_ERROR_MESSAGE
          : create.isError
            ? patientSubmitErrorMessage(create.error, '登録', staffStopped)
            : undefined
      }
      isSubmitting={create.isPending}
      onClose={() => navigate({ to: '/patients' })}
      onSubmit={(input) =>
        create.mutate(input, {
          onSuccess: (patient) =>
            navigate({ to: '/patients/$patientId', params: { patientId: patient.id } }),
          onError: async (error) =>
            setStaffStopped(await isStaffStopped(error, input.assigned_staff_id)),
        })
      }
      serviceCodes={optionsFailed ? undefined : serviceCodes.data}
      staffOptions={
        optionsFailed || staff.data === undefined
          ? undefined
          : activeStaffOptions(staff.data).map((s) => ({ id: s.id, label: s.username }))
      }
    />
  )
}

/**
 * 利用者の一覧に重ねる、利用者の登録のダイアログ。職員の管理の権限が無ければ出さず、一覧が権限の無いことを示す。
 * 登録できたら、登録した利用者の詳細へ移る。
 */
export const PatientCreateDialogContainer = () => {
  return (
    <PermissionGuard permission={STAFF_MANAGE}>
      <PatientCreateDialogContent />
    </PermissionGuard>
  )
}
