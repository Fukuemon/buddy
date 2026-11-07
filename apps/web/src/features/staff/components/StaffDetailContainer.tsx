import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '#/api/BuddyApi'
import type { Staff, StaffAssignments } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

import {
  ASSIGNMENTS_LOAD_ERROR_MESSAGE,
  DETAIL_LOAD_ERROR_MESSAGE,
  DETAIL_NOT_FOUND_MESSAGE,
  POLICIES_LOAD_ERROR_MESSAGE,
  POLICY_ALL_REFUSED_LEAD,
  POLICY_PARTIAL_ERROR_LEAD,
  POLICY_SAVE_ERROR_MESSAGE,
  POSITION_OPTIONS_LOAD_ERROR_MESSAGE,
  PROFILE_OPTIONS_LOAD_ERROR_MESSAGE,
  leaveErrorMessage,
  positionErrorMessage,
  reinstateErrorMessage,
  retireErrorMessage,
  staffSubmitErrorMessage,
} from '../lib/errorMessage'
import { orderPolicies } from '../lib/policyOrder'
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
  /** 権限の保存で変えられなかった変更と、送った変更の全てを変えられなかったか。 */
  const [policyFailure, setPolicyFailure] = useState<{
    failures: PolicySaveFailure[]
    isAll: boolean
  }>()

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

  /** 読めなかった選択肢を読み直す。ページで読む query は、ダイアログを開き直しても読み直さないためである。 */
  const refetchFailedOptions = () => {
    for (const query of [teams, positions]) if (query.isError) void query.refetch()
  }

  const openDialog = (next: Open) => {
    if (next !== null) refetchFailedOptions()
    // 復職の失敗の文はダイアログの外に出すので、ほかの操作を始めたときにここで消す
    for (const mutation of [update, changePosition, savePolicies, startLeave, reinstate, retire])
      mutation.reset()
    setRefusedAssignments(undefined)
    setPolicyFailure(undefined)
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
  // 役職を読み終えるまでは、役職で付いた権限を見分けられないので、権限の一覧を出さない
  const orderedPolicies =
    policies.data === undefined || positions.data === undefined
      ? undefined
      : orderPolicies(policies.data)
  const policiesLoadError =
    (policies.data === undefined && policies.isError) ||
    (positions.data === undefined && positions.isError)
      ? POLICIES_LOAD_ERROR_MESSAGE
      : undefined
  const profileOptionsFailed = departments.isError || teams.isError
  const assignmentsError = assignments.isError ? ASSIGNMENTS_LOAD_ERROR_MESSAGE : undefined
  const policiesError = savePolicies.isError
    ? POLICY_SAVE_ERROR_MESSAGE
    : policyFailure === undefined
      ? undefined
      : `${policyFailure.isAll ? POLICY_ALL_REFUSED_LEAD : POLICY_PARTIAL_ERROR_LEAD}${policyFailure.failures.map((f) => `${f.name}: ${f.reason}`).join('')}`

  return (
    <>
      <StaffDetailView
        isReinstating={reinstate.isPending}
        isSelf={staffId === viewerId}
        onChangePolicies={() => openDialog('policies')}
        onChangePosition={() => openDialog('position')}
        onEdit={() => openDialog('profile')}
        onLeave={() => openDialog('leave')}
        onReinstate={() => reinstate.mutateAsync()}
        onRetire={() => openDialog('retire')}
        onRetry={() =>
          queryClient.resetQueries({ queryKey: queryKeys.staff.detail(facilityId, staffId) })
        }
        onRetryPolicies={() => {
          for (const query of [policies, positions]) if (query.isError) void query.refetch()
        }}
        policies={orderedPolicies}
        policiesLoadError={policiesLoadError}
        position={position}
        reinstateErrorMessage={
          reinstate.isError ? reinstateErrorMessage(reinstate.error) : undefined
        }
        state={state}
        targetNames={targetNames}
      />
      {staff !== undefined && open === 'profile' && (
        <StaffProfileDialog
          departments={profileOptionsFailed ? undefined : departments.data}
          errorMessage={
            profileOptionsFailed
              ? PROFILE_OPTIONS_LOAD_ERROR_MESSAGE
              : update.isError
                ? staffSubmitErrorMessage(update.error, '保存')
                : undefined
          }
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
          teams={profileOptionsFailed ? undefined : teams.data}
        />
      )}
      {staff !== undefined && open === 'position' && (
        <StaffPositionDialog
          errorMessage={
            positions.isError
              ? POSITION_OPTIONS_LOAD_ERROR_MESSAGE
              : changePosition.isError
                ? positionErrorMessage(changePosition.error)
                : undefined
          }
          isSubmitting={changePosition.isPending}
          onClose={close}
          onSubmit={(positionId) => changePosition.mutate(positionId, { onSuccess: close })}
          positions={positions.isError ? undefined : positions.data}
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
                failures.length === 0
                  ? close()
                  : setPolicyFailure({ failures, isAll: failures.length === changes.length }),
            })
          }
          policies={orderedPolicies}
          position={position}
          staff={staff}
          staffOptions={
            staffList.data && byName(staffList.data.filter((s) => s.status === undefined))
          }
          teamOptions={teams.data && byName(teams.data)}
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
 * 職員の詳細の画面。
 * 職員、役職、権限と、権限の対象の名前を引く職員とチームを読み、プロフィール、役職、権限、在籍を変える。
 */
export const StaffDetailContainer = ({ staffId }: { staffId: Staff['id'] }) => {
  const { viewer } = useBuddyApi()
  return <StaffDetailContent staffId={staffId} viewerId={viewer.staffId} />
}
