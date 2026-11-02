import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '#/api/client'
import type { Patient, PatientSchedules } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'

import {
  DETAIL_LOAD_ERROR_MESSAGE,
  DETAIL_NOT_FOUND_MESSAGE,
  OPTIONS_LOAD_ERROR_MESSAGE,
  REMAINING_LOAD_ERROR_MESSAGE,
  endServiceErrorMessage,
  patientSubmitErrorMessage,
  resumeServiceErrorMessage,
} from '../lib/errorMessage'
import { activeStaffOptions, editStaffOptions } from '../lib/format'
import {
  patientDetailQueryOptions,
  patientQueryKeys,
  remainingSchedulesQueryOptions,
  serviceCodesQueryOptions,
  staffRecordsQueryOptions,
  useEndService,
  useIsStaffStopped,
  useResumeService,
  useUpdatePatient,
} from '../queries'
import { PatientDetailView, type PatientDetailViewState } from './PatientDetailView'
import { PatientEditDialog } from './PatientEditDialog'
import { PatientEndDialog } from './PatientEndDialog'
import { PatientResumeDialog } from './PatientResumeDialog'

/** 開いているダイアログ。 */
type Open = 'edit' | 'end' | 'resume' | null

const PatientDetailContent = ({ patientId }: { patientId: Patient['id'] }) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Open>(null)
  const [refusedSchedules, setRefusedSchedules] = useState<PatientSchedules>()
  const [staffStopped, setStaffStopped] = useState(false)

  const detail = useQuery(patientDetailQueryOptions(api, facilityId, patientId))
  const staff = useQuery(staffRecordsQueryOptions(api, facilityId))
  const serviceCodes = useQuery(serviceCodesQueryOptions(api, facilityId))
  const remaining = useQuery({
    ...remainingSchedulesQueryOptions(api, facilityId, patientId),
    enabled: open === 'end',
  })

  const update = useUpdatePatient(patientId)
  const endService = useEndService(patientId)
  const resumeService = useResumeService(patientId)
  const isStaffStopped = useIsStaffStopped()

  const openDialog = (next: Open) => {
    for (const mutation of [update, endService, resumeService]) mutation.reset()
    setRefusedSchedules(undefined)
    setStaffStopped(false)
    if (next !== null) {
      for (const options of [staff, serviceCodes]) if (options.isError) void options.refetch()
    }
    setOpen(next)
  }
  const close = () => openDialog(null)

  const state: PatientDetailViewState = detail.isPending
    ? { status: 'loading' }
    : detail.isError
      ? detail.error instanceof ApiError && detail.error.status === 404
        ? { status: 'error', message: DETAIL_NOT_FOUND_MESSAGE, canRetry: false }
        : { status: 'error', message: DETAIL_LOAD_ERROR_MESSAGE, canRetry: true }
      : { status: 'ready', patient: detail.data }
  const patient = detail.data
  const currentStaff = staff.data?.find((s) => s.id === patient?.assigned_staff_id)
  const activeStaff = staff.data === undefined ? undefined : activeStaffOptions(staff.data)
  const optionsFailed = staff.isError || serviceCodes.isError

  return (
    <>
      <PatientDetailView
        onEdit={() => openDialog('edit')}
        onEnd={() => openDialog('end')}
        onResume={() => openDialog('resume')}
        onRetry={() =>
          queryClient.resetQueries({ queryKey: patientQueryKeys.detail(facilityId, patientId) })
        }
        serviceCodes={serviceCodes.data}
        staff={staff.data}
        state={state}
      />
      {patient !== undefined && open === 'edit' && (
        <PatientEditDialog
          errorMessage={
            optionsFailed
              ? OPTIONS_LOAD_ERROR_MESSAGE
              : update.isError
                ? patientSubmitErrorMessage(update.error, '保存', staffStopped)
                : undefined
          }
          isSubmitting={update.isPending}
          onClose={close}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: close,
              onError: async (error) =>
                setStaffStopped(await isStaffStopped(error, input.assigned_staff_id)),
            })
          }
          patient={patient}
          serviceCodes={optionsFailed ? undefined : serviceCodes.data}
          staffOptions={
            optionsFailed || activeStaff === undefined
              ? undefined
              : editStaffOptions(patient, staff.data ?? [])
          }
        />
      )}
      {patient !== undefined && open === 'end' && (
        <PatientEndDialog
          errorMessage={endService.isError ? endServiceErrorMessage(endService.error) : undefined}
          isSubmitting={endService.isPending}
          onCancel={close}
          onSubmit={() =>
            endService.mutate(undefined, {
              onSuccess: (result) =>
                'ended' in result ? close() : setRefusedSchedules(result.schedules),
            })
          }
          patient={patient}
          schedules={refusedSchedules ?? remaining.data}
          schedulesError={remaining.isError ? REMAINING_LOAD_ERROR_MESSAGE : undefined}
        />
      )}
      {patient !== undefined && open === 'resume' && (
        <PatientResumeDialog
          currentStaff={currentStaff}
          errorMessage={
            staff.isError
              ? OPTIONS_LOAD_ERROR_MESSAGE
              : resumeService.isError
                ? resumeServiceErrorMessage(resumeService.error)
                : undefined
          }
          isSubmitting={resumeService.isPending}
          onCancel={close}
          onSubmit={(assignedStaffId) =>
            resumeService.mutate(assignedStaffId, { onSuccess: close })
          }
          patient={patient}
          staffOptions={activeStaff}
        />
      )}
    </>
  )
}

/**
 * 利用者の詳細の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * 利用者と、担当の職員の状態を出す職員とサービスコードを読み、利用者の編集、利用の終了、利用の再開をダイアログで行う。
 */
export const PatientDetailContainer = ({ patientId }: { patientId: Patient['id'] }) => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? (
    <PatientDetailContent patientId={patientId} />
  ) : (
    <PageForbiddenMessage />
  )
}
