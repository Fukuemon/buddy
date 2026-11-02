import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import type { Department, Team } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'
import { nextTeamColor } from '#/components/teamColor'

import { LOAD_ERROR_MESSAGE, submitErrorMessage } from '../lib/errorMessage'
import {
  departmentsQueryOptions,
  teamsQueryOptions,
  useSaveDepartment,
  useSaveTeam,
} from '../queries'
import { OrganizationListView, type OrganizationListViewState } from './OrganizationListView'
import { OrganizationUnitDialog, type OrganizationUnitValue } from './OrganizationUnitDialog'

/** 開いているダイアログ。target が無ければ作成である。 */
type Editing =
  | { kind: 'department'; target?: Department }
  | { kind: 'team'; target?: Team; defaultColor: Team['color'] }

const byName = <T extends { name: string }>(units: readonly T[]) =>
  [...units].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

const OrganizationListContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const departments = useQuery(departmentsQueryOptions(api, facilityId))
  const teams = useQuery(teamsQueryOptions(api, facilityId))
  const saveDepartment = useSaveDepartment()
  const saveTeam = useSaveTeam()
  const [editing, setEditing] = useState<Editing>()
  const [submittedName, setSubmittedName] = useState('')

  const state: OrganizationListViewState =
    departments.isError || teams.isError
      ? { status: 'error', message: LOAD_ERROR_MESSAGE }
      : departments.isPending || teams.isPending
        ? { status: 'loading' }
        : { status: 'ready', departments: byName(departments.data), teams: byName(teams.data) }

  const open = (next: Editing) => {
    saveDepartment.reset()
    saveTeam.reset()
    setEditing(next)
  }
  const mutation = editing?.kind === 'team' ? saveTeam : saveDepartment
  const submit = (value: OrganizationUnitValue) => {
    if (editing === undefined) return
    const close = { onSuccess: () => setEditing(undefined) }
    mutation.reset()
    setSubmittedName(value.name)
    if (editing.kind === 'department') {
      saveDepartment.mutate({ departmentId: editing.target?.id, name: value.name }, close)
    } else {
      saveTeam.mutate(
        {
          teamId: editing.target?.id,
          input: { name: value.name, color: value.color ?? editing.defaultColor },
        },
        close,
      )
    }
  }

  return (
    <>
      <OrganizationListView
        onCreateDepartment={() => open({ kind: 'department' })}
        onCreateTeam={() => open({ kind: 'team', defaultColor: nextTeamColor(teams.data ?? []) })}
        onEditDepartment={(target) => open({ kind: 'department', target })}
        onEditTeam={(target) => open({ kind: 'team', target, defaultColor: target.color })}
        onRetry={() =>
          Promise.all([
            queryClient.resetQueries({ queryKey: queryKeys.departments(facilityId) }),
            queryClient.resetQueries({ queryKey: queryKeys.teams(facilityId) }),
          ])
        }
        state={state}
      />
      {editing !== undefined && (
        <OrganizationUnitDialog
          errorMessage={
            mutation.isError
              ? submitErrorMessage(mutation.error, editing.kind, submittedName)
              : undefined
          }
          initial={
            editing.kind === 'team'
              ? { name: editing.target?.name ?? '', color: editing.defaultColor }
              : { name: editing.target?.name ?? '' }
          }
          isSubmitting={mutation.isPending}
          kind={editing.kind}
          mode={editing.target === undefined ? 'create' : 'edit'}
          onClose={() => setEditing(undefined)}
          onSubmit={submit}
        />
      )}
    </>
  )
}

/**
 * 部署とチームの画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * 部署とチームを読み、作成と編集はこの画面の上に重ねたダイアログで行う。保存したら、部署とチームを読み直してダイアログを閉じる。
 */
export const OrganizationListContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <OrganizationListContent /> : <PageForbiddenMessage />
}
