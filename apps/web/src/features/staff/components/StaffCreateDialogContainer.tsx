import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { STAFF_MANAGE } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PermissionGuard } from '#/components/PermissionGuard'

import { OPTIONS_LOAD_ERROR_MESSAGE, staffSubmitErrorMessage } from '../lib/errorMessage'
import {
  departmentsQueryOptions,
  positionsQueryOptions,
  teamsQueryOptions,
  useCreateStaff,
} from '../queries'
import { StaffCreateDialog } from './StaffCreateDialog'

const StaffCreateDialogContent = () => {
  const { api, facilityId } = useBuddyApi()
  const navigate = useNavigate()
  const departments = useQuery(departmentsQueryOptions(api, facilityId))
  const teams = useQuery(teamsQueryOptions(api, facilityId))
  const positions = useQuery(positionsQueryOptions(api, facilityId))
  const create = useCreateStaff()
  const optionsFailed = [departments, teams, positions].some((query) => query.isError)

  return (
    <StaffCreateDialog
      departments={optionsFailed ? undefined : departments.data}
      errorMessage={
        optionsFailed
          ? OPTIONS_LOAD_ERROR_MESSAGE
          : create.isError
            ? staffSubmitErrorMessage(create.error, '登録')
            : undefined
      }
      isSubmitting={create.isPending}
      onClose={() => navigate({ to: '/staff' })}
      onSubmit={(input) =>
        create.mutate(input, {
          onSuccess: (staff) => navigate({ to: '/staff/$staffId', params: { staffId: staff.id } }),
        })
      }
      positions={optionsFailed ? undefined : positions.data}
      teams={optionsFailed ? undefined : teams.data}
    />
  )
}

/**
 * 職員の一覧に重ねる、職員の登録のダイアログ。職員の管理の権限が無ければ出さず、一覧が権限の無いことを示す。
 * 登録できたら、登録した職員の詳細へ移る。
 */
export const StaffCreateDialogContainer = () => {
  return (
    <PermissionGuard permission={STAFF_MANAGE}>
      <StaffCreateDialogContent />
    </PermissionGuard>
  )
}
