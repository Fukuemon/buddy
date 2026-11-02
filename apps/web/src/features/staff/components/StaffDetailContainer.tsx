import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '#/api/BuddyApi'
import type { Staff, StaffAssignments } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'

import {
  ASSIGNMENTS_LOAD_ERROR_MESSAGE,
  DETAIL_LOAD_ERROR_MESSAGE,
  DETAIL_NOT_FOUND_MESSAGE,
  POLICY_PARTIAL_ERROR_LEAD,
  POLICY_SAVE_ERROR_MESSAGE,
  leaveErrorMessage,
  positionErrorMessage,
  reinstateErrorMessage,
  retireErrorMessage,
  staffSubmitErrorMessage,
} from '../lib/errorMessage'
import { orderPolicies } from '../lib/policyChanges'
import {
  assignmentsQueryOptions,
  departmentsQueryOptions,
  policiesQueryOptions,
  positionsQueryOptions,
  staffDetailQueryOptions,
  staffListQueryOptions,
  teamsQueryOptions,
  useChangePosition,
  useReinstate,
  useRetire,
  useSavePolicies,
  useStartLeave,
  useUpdateStaff,
  type PolicySaveFailure,
} from '../queries'
import { StaffDetailView, type StaffDetailViewState } from './StaffDetailView'
import { StaffLeaveDialog } from './StaffLeaveDialog'
import { StaffPoliciesDialog } from './StaffPoliciesDialog'
import { StaffPositionDialog } from './StaffPositionDialog'
import { StaffProfileDialog } from './StaffProfileDialog'
import { StaffRetireDialog } from './StaffRetireDialog'

/** 開いているダイアログ。 */
type Open = 'profile' | 'position' | 'policies' | 'leave' | 'retire' | null

const byName = <T extends { name: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

const StaffDetailContent = ({ staffId, viewerId }: { staffId: Staff['id']; viewerId: string }) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Open>(null)
  const [refusedAssignments, setRefusedAssignments] = useState<StaffAssignments>()
  const [policyFailures, setPolicyFailures] = useState<PolicySaveFailure[]>([])

  const detail = useQuery(staffDetailQueryOptions(api, facilityId, staffId))
  const staffList = useQuery(staffListQueryOptions(api, facilityId))
  const teams = useQuery(teamsQueryOptions(api, facilityId))
  const positions = useQuery(positionsQueryOptions(api, facilityId))
  const policies = useQuery(policiesQueryOptions(api, facilityId))
  const departments = useQuery({
    ...departmentsQueryOptions(api, facilityId),
    enabled: open === 'profile',
  })
  const assignments = useQuery({
    ...assignmentsQueryOptions(api, facilityId, staffId),
    enabled: open === 'leave' || open === 'retire',
  })

  const update = useUpdateStaff(staffId)
  const changePosition = useChangePosition(staffId)
  const savePolicies = useSavePolicies(staffId)
  const startLeave = useStartLeave(staffId)
  const reinstate = useReinstate(staffId)
  const retire = useRetire(staffId)

  const openDialog = (next: Open) => {
    for (const mutation of [update, changePosition, savePolicies, startLeave, retire])
      mutation.reset()
    setRefusedAssignments(undefined)
    setPolicyFailures([])
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
  const position = positions.data?.find((p) => p.id === staff?.position.id)
  const orderedPolicies = policies.data === undefined ? undefined : orderPolicies(policies.data)
  const assignmentsError = assignments.isError ? ASSIGNMENTS_LOAD_ERROR_MESSAGE : undefined
  const policiesError = savePolicies.isError
    ? POLICY_SAVE_ERROR_MESSAGE
    : policyFailures.length > 0
      ? `${POLICY_PARTIAL_ERROR_LEAD}${policyFailures.map((f) => `${f.name}: ${f.reason}`).join('')}`
      : undefined

  return (
    <>
      <StaffDetailView
        isReinstating={reinstate.isPending}
        isSelf={staffId === viewerId}
        onChangePolicies={() => openDialog('policies')}
        onChangePosition={() => openDialog('position')}
        onEdit={() => openDialog('profile')}
        onLeave={() => openDialog('leave')}
        onReinstate={() => reinstate.mutate()}
        onRetire={() => openDialog('retire')}
        onRetry={() =>
          queryClient.resetQueries({ queryKey: queryKeys.staff.detail(facilityId, staffId) })
        }
        policies={orderedPolicies}
        position={position}
        reinstateErrorMessage={
          reinstate.isError ? reinstateErrorMessage(reinstate.error) : undefined
        }
        state={state}
        targetNames={targetNames}
      />
      {staff !== undefined && open === 'profile' && (
        <StaffProfileDialog
          departments={departments.data}
          errorMessage={update.isError ? staffSubmitErrorMessage(update.error, '保存') : undefined}
          isSubmitting={update.isPending}
          onClose={close}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: (result) =>
                'updated' in result ? close() : setRefusedAssignments(result.assignments),
            })
          }
          refusedAssignments={refusedAssignments}
          staff={staff}
          teams={teams.data}
        />
      )}
      {staff !== undefined && open === 'position' && (
        <StaffPositionDialog
          errorMessage={
            changePosition.isError ? positionErrorMessage(changePosition.error) : undefined
          }
          isSubmitting={changePosition.isPending}
          onClose={close}
          onSubmit={(positionId) => changePosition.mutate(positionId, { onSuccess: close })}
          positions={positions.data}
          staff={staff}
        />
      )}
      {staff !== undefined && orderedPolicies !== undefined && open === 'policies' && (
        <StaffPoliciesDialog
          errorMessage={policiesError}
          isSubmitting={savePolicies.isPending}
          onClose={close}
          onSubmit={(changes) =>
            savePolicies.mutate(changes, {
              onSuccess: (failures) =>
                failures.length === 0 ? close() : setPolicyFailures(failures),
            })
          }
          policies={orderedPolicies}
          position={position}
          staff={staff}
          staffOptions={byName((staffList.data ?? []).filter((s) => s.status === undefined))}
          teamOptions={byName(teams.data ?? [])}
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
 * 職員、役職、権限と、権限の対象の名前を引く職員とチームを読み、プロフィール、役職、権限、在籍を変える。
 */
export const StaffDetailContainer = ({ staffId }: { staffId: Staff['id'] }) => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? (
    <StaffDetailContent staffId={staffId} viewerId={viewer.staffId} />
  ) : (
    <PageForbiddenMessage />
  )
}
