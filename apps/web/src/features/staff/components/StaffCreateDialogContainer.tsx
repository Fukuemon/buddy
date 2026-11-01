import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'

import { useBuddyApi } from '#/api/useBuddyApi'

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
          onSuccess: () => navigate({ to: '/staff' }),
        })
      }
      positions={optionsFailed ? undefined : positions.data}
      teams={optionsFailed ? undefined : teams.data}
    />
  )
}

/**
 * 職員の一覧に重ねる、職員の登録のダイアログ。職員の管理の権限が無ければ出さず、一覧が権限の無いことを示す。
 * 登録できたら、職員の一覧に戻る。職員の詳細の画面を足したら、登録した職員の詳細へ移す。
 */
export const StaffCreateDialogContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <StaffCreateDialogContent /> : null
}
