import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '#/api/client'
import type { Staff, StaffAssignments } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/site/PageForbiddenMessage'

import {
  ASSIGNMENTS_LOAD_ERROR_MESSAGE,
  DETAIL_LOAD_ERROR_MESSAGE,
  DETAIL_NOT_FOUND_MESSAGE,
  addPolicyErrorMessage,
  leaveErrorMessage,
  positionErrorMessage,
  reinstateErrorMessage,
  removePolicyErrorMessage,
  retireErrorMessage,
  staffSubmitErrorMessage,
} from '../lib/errorMessage'
import {
  assignmentsQueryOptions,
  departmentsQueryOptions,
  policiesQueryOptions,
  positionsQueryOptions,
  staffDetailQueryOptions,
  staffListQueryOptions,
  staffQueryKeys,
  teamsQueryOptions,
  useAddPolicy,
  useChangePosition,
  useReinstate,
  useRemovePolicy,
  useRetire,
  useStartLeave,
  useUpdateStaff,
} from '../queries'
import { POLICY_COUNT } from '../lib/format'
import { StaffDetailView, type StaffDetailViewState } from './StaffDetailView'
import { StaffLeaveDialog } from './StaffLeaveDialog'
import { StaffPolicyAddDialog } from './StaffPolicyAddDialog'
import { StaffPositionDialog } from './StaffPositionDialog'
import { StaffProfileForm } from './StaffProfileForm'
import { StaffRetireDialog } from './StaffRetireDialog'

/** 開いているダイアログ。基本の情報の編集はダイアログにせず、枠を入力の欄に替える。 */
type Open = 'profile' | 'position' | 'policy' | 'leave' | 'retire' | null

const StaffDetailContent = ({ staffId, viewerId }: { staffId: Staff['id']; viewerId: string }) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Open>(null)
  const [refusedAssignments, setRefusedAssignments] = useState<StaffAssignments>()

  const detail = useQuery(staffDetailQueryOptions(api, facilityId, staffId))
  const staffList = useQuery(staffListQueryOptions(api, facilityId))
  const teams = useQuery(teamsQueryOptions(api, facilityId))
  const departments = useQuery({
    ...departmentsQueryOptions(api, facilityId),
    enabled: open === 'profile',
  })
  const positions = useQuery({
    ...positionsQueryOptions(api, facilityId),
    enabled: open === 'position',
  })
  const policies = useQuery({
    ...policiesQueryOptions(api, facilityId),
    enabled: open === 'policy',
  })
  const assignments = useQuery({
    ...assignmentsQueryOptions(api, facilityId, staffId),
    enabled: open === 'leave' || open === 'retire',
  })

  const update = useUpdateStaff(staffId)
  const changePosition = useChangePosition(staffId)
  const addPolicy = useAddPolicy(staffId)
  const removePolicy = useRemovePolicy(staffId)
  const startLeave = useStartLeave(staffId)
  const reinstate = useReinstate(staffId)
  const retire = useRetire(staffId)

  const openDialog = (next: Open) => {
    for (const mutation of [update, changePosition, addPolicy, startLeave, retire]) mutation.reset()
    setRefusedAssignments(undefined)
    setOpen(next)
  }
  const close = () => openDialog(null)

  const targetNames = new Map<string, string>([
    ...(staffList.data ?? []).map((s) => [s.id, s.name] as const),
    ...(teams.data ?? []).map((t) => [t.id, t.name] as const),
  ])

  const state: StaffDetailViewState = detail.isPending
    ? { status: 'loading' }
    : detail.isError
      ? detail.error instanceof ApiError && detail.error.status === 404
        ? { status: 'error', message: DETAIL_NOT_FOUND_MESSAGE, canRetry: false }
        : { status: 'error', message: DETAIL_LOAD_ERROR_MESSAGE, canRetry: true }
      : { status: 'ready', staff: detail.data }
  const staff = detail.data
  const assignmentsError = assignments.isError ? ASSIGNMENTS_LOAD_ERROR_MESSAGE : undefined

  return (
    <>
      <StaffDetailView
        canAddPolicy={staff === undefined || staff.policies.length < POLICY_COUNT}
        isReinstating={reinstate.isPending}
        isSelf={staffId === viewerId}
        onAddPolicy={() => openDialog('policy')}
        onChangePosition={() => openDialog('position')}
        onEdit={() => openDialog('profile')}
        onLeave={() => openDialog('leave')}
        onReinstate={() => reinstate.mutate()}
        onRemovePolicy={(userPolicyId) => removePolicy.mutate(userPolicyId)}
        onRetire={() => openDialog('retire')}
        onRetry={() =>
          queryClient.resetQueries({ queryKey: staffQueryKeys.detail(facilityId, staffId) })
        }
        policyErrorMessage={
          removePolicy.isError ? removePolicyErrorMessage(removePolicy.error) : undefined
        }
        profileEditor={
          open === 'profile' && staff !== undefined ? (
            <StaffProfileForm
              departments={departments.data}
              errorMessage={
                update.isError ? staffSubmitErrorMessage(update.error, '保存') : undefined
              }
              isSubmitting={update.isPending}
              onCancel={close}
              onSubmit={(input) => update.mutate(input, { onSuccess: close })}
              staff={staff}
              teams={teams.data}
            />
          ) : undefined
        }
        reinstateErrorMessage={
          reinstate.isError ? reinstateErrorMessage(reinstate.error) : undefined
        }
        removingPolicyId={removePolicy.isPending ? removePolicy.variables : undefined}
        state={state}
        targetNames={targetNames}
      />
      {staff !== undefined && open === 'position' && (
        <StaffPositionDialog
          errorMessage={
            changePosition.isError ? positionErrorMessage(changePosition.error) : undefined
          }
          isSubmitting={changePosition.isPending}
          onCancel={close}
          onSubmit={(positionId) => changePosition.mutate(positionId, { onSuccess: close })}
          positions={positions.data}
          staff={staff}
        />
      )}
      {staff !== undefined && open === 'policy' && (
        <StaffPolicyAddDialog
          errorMessage={addPolicy.isError ? addPolicyErrorMessage(addPolicy.error) : undefined}
          isSubmitting={addPolicy.isPending}
          onCancel={close}
          onSubmit={(input) => addPolicy.mutate(input, { onSuccess: close })}
          policies={policies.data}
          staff={staff}
          staffOptions={(staffList.data ?? [])
            .filter((s) => s.status === undefined)
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))}
          teamOptions={[...(teams.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ja'))}
        />
      )}
      {staff !== undefined && open === 'leave' && (
        <StaffLeaveDialog
          assignments={assignments.data}
          assignmentsError={assignmentsError}
          errorMessage={startLeave.isError ? leaveErrorMessage(startLeave.error) : undefined}
          isSubmitting={startLeave.isPending}
          onCancel={close}
          onSubmit={(returnDate) => startLeave.mutate(returnDate, { onSuccess: close })}
          staff={staff}
        />
      )}
      {staff !== undefined && open === 'retire' && (
        <StaffRetireDialog
          assignments={refusedAssignments ?? assignments.data}
          assignmentsError={assignmentsError}
          errorMessage={retire.isError ? retireErrorMessage(retire.error) : undefined}
          isSubmitting={retire.isPending}
          onCancel={close}
          onSubmit={() =>
            retire.mutate(undefined, {
              onSuccess: (result) =>
                'retired' in result ? close() : setRefusedAssignments(result.assignments),
            })
          }
          staff={staff}
        />
      )}
    </>
  )
}

/**
 * 職員の詳細の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * 職員と、権限の対象の名前を引く職員とチームを読み、基本の情報、役職、権限、在籍を変える。
 */
export const StaffDetailContainer = ({ staffId }: { staffId: Staff['id'] }) => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? (
    <StaffDetailContent staffId={staffId} viewerId={viewer.staffId} />
  ) : (
    <PageForbiddenMessage />
  )
}
