import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import type { Staff } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'

import {
  LINK_LOAD_ERROR_MESSAGE,
  linkErrorMessage,
  loadErrorMessage,
  unlinkErrorMessage,
} from '../lib/errorMessage'
import {
  externalCalendarListQueryOptions,
  serviceAccountQueryOptions,
  staffListQueryOptions,
  useCheckCalendar,
  useLinkCalendar,
  useUnlinkCalendar,
} from '../queries'
import { CalendarLinkDialog, type CalendarCheckStatus } from './CalendarLinkDialog'
import type { CalendarLinkRow } from './CalendarLinkTable'
import { CalendarLinkView, type CalendarLinkViewState } from './CalendarLinkView'
import { CalendarUnlinkDialog } from './CalendarUnlinkDialog'

type OpenDialog = { kind: 'link' | 'unlink'; staffId: Staff['id'] } | null

const CalendarLinkContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const calendarsQuery = useQuery(externalCalendarListQueryOptions(api, facilityId))
  const accountQuery = useQuery(serviceAccountQueryOptions(api, facilityId))
  const check = useCheckCalendar()
  const link = useLinkCalendar()
  const unlink = useUnlinkCalendar()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [calendarId, setCalendarId] = useState('')

  const queries = [staffQuery, calendarsQuery, accountQuery]
  const failed = queries.find((query) => query.isError)
  // 退職した職員は、退職でカレンダーが外れ、結び付けられないので出さない
  const rows: CalendarLinkRow[] = (staffQuery.data ?? [])
    .filter((staff) => staff.status !== 'retired')
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((staff) => ({
      staff,
      calendar: calendarsQuery.data?.find((calendar) => calendar.staff_id === staff.id),
    }))
  const state: CalendarLinkViewState =
    failed !== undefined
      ? { status: 'error', message: loadErrorMessage(failed.error, LINK_LOAD_ERROR_MESSAGE) }
      : queries.some((query) => query.isPending)
        ? { status: 'loading' }
        : { status: 'ready', rows, serviceAccount: accountQuery.data ?? null }

  const retry = () =>
    Promise.all(
      [
        queryKeys.staff.list(facilityId),
        queryKeys.calendars.list(facilityId),
        queryKeys.calendars.serviceAccount(facilityId),
      ].map((queryKey) => queryClient.resetQueries({ queryKey })),
    )

  const resetDialog = () => {
    check.reset()
    link.reset()
    unlink.reset()
  }
  const open = (kind: 'link' | 'unlink', staffId: Staff['id']) => {
    resetDialog()
    setCalendarId(rows.find((row) => row.staff.id === staffId)?.staff.email ?? '')
    setDialog({ kind, staffId })
  }
  const close = () => {
    resetDialog()
    setDialog(null)
  }

  const trimmed = calendarId.trim()
  const checkStatus: CalendarCheckStatus = check.isPending
    ? 'checking'
    : link.isError || check.isError
      ? 'failed'
      : check.isSuccess && check.variables === trimmed
        ? 'readable'
        : 'idle'
  const selected = rows.find((row) => row.staff.id === dialog?.staffId)
  const unlinkTarget = dialog?.kind === 'unlink' ? selected?.calendar : undefined

  return (
    <>
      <CalendarLinkView
        onImport={(staffId) => navigate({ to: '/schedule/import', search: { staff: staffId } })}
        onLink={(staffId) => open('link', staffId)}
        onRetry={retry}
        onUnlink={(staffId) => open('unlink', staffId)}
        state={state}
      />
      {dialog?.kind === 'link' && selected !== undefined && (
        <CalendarLinkDialog
          calendarId={calendarId}
          checkStatus={checkStatus}
          errorMessage={
            link.isError
              ? linkErrorMessage(link.error)
              : check.isError
                ? linkErrorMessage(check.error)
                : undefined
          }
          isSubmitting={link.isPending}
          onCalendarIdChange={(value) => {
            setCalendarId(value)
            check.reset()
            link.reset()
          }}
          onCheck={() => {
            link.reset()
            check.mutate(trimmed)
          }}
          onClose={close}
          onSubmit={() =>
            link.mutate({ staffId: selected.staff.id, calendarId: trimmed }, { onSuccess: close })
          }
          staffName={selected.staff.name}
        />
      )}
      {selected !== undefined && unlinkTarget !== undefined && (
        <CalendarUnlinkDialog
          calendarId={unlinkTarget.calendar_id}
          errorMessage={unlink.isError ? unlinkErrorMessage(unlink.error) : undefined}
          isSubmitting={unlink.isPending}
          onCancel={close}
          onSubmit={() => unlink.mutate(unlinkTarget.id, { onSuccess: close })}
          staffName={selected.staff.name}
        />
      )}
    </>
  )
}

/**
 * カレンダーの連携の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * 職員、結び付けたカレンダー、サービスアカウントを読み、結び付けると外すをダイアログで行う。
 */
export const CalendarLinkContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <CalendarLinkContent /> : <PageForbiddenMessage />
}
