import { useQuery, useQueryClient } from '@tanstack/react-query'

import { STAFF_MANAGE, hasPermission } from '#/api/permissions'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'
import { useViewer } from '#/api/viewer'

import {
  meQueryOptions,
  myExternalCalendarQueryOptions,
  staffListQueryOptions,
  teamsQueryOptions,
} from '../queries'
import { AccountProfileView, type AccountProfileViewState } from './AccountProfileView'

/** 自分の情報の画面。自分の詳細、結び付いたカレンダー、権限の対象の名前を引く職員とチームを読む。一度も読めなかったものがあれば読み込みの失敗にし、読み終えた後に読めなかったときは表示を残して失敗の文を出す。 */
export const AccountProfileContainer = () => {
  const { api, facilityId } = useBuddyApi()
  const viewer = useViewer()
  const queryClient = useQueryClient()
  const queries = [
    useQuery(meQueryOptions(api, facilityId)),
    useQuery(myExternalCalendarQueryOptions(api, facilityId)),
    useQuery(staffListQueryOptions(api, facilityId)),
    useQuery(teamsQueryOptions(api, facilityId)),
  ] as const
  const [me, calendar, staffList, teams] = queries

  // 読み終えた後に読み直して読めなかったときは、読み終えたデータで出し続ける
  const state: AccountProfileViewState =
    me.data !== undefined &&
    calendar.data !== undefined &&
    staffList.data !== undefined &&
    teams.data !== undefined
      ? {
          status: 'ready',
          staff: me.data,
          calendar: calendar.data,
          targetNames: new Map([
            ...staffList.data.map((s) => [s.id, s.name] as const),
            ...teams.data.map((t) => [t.id, t.name] as const),
          ]),
          refetchFailed: queries.some((q) => q.isError),
        }
      : queries.some((q) => q.isError)
        ? { status: 'error' }
        : { status: 'loading' }

  return (
    <AccountProfileView
      canManageStaff={hasPermission(viewer, STAFF_MANAGE)}
      onRefetch={() => {
        for (const query of queries) if (query.isError) void query.refetch()
      }}
      onRetry={() => {
        for (const queryKey of [
          queryKeys.me.detail(facilityId),
          queryKeys.me.calendar(facilityId),
          queryKeys.staff.list(facilityId),
          queryKeys.teams(facilityId),
        ])
          void queryClient.resetQueries({ queryKey })
      }}
      state={state}
    />
  )
}
