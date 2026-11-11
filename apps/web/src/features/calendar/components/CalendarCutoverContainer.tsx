import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { queryKeys } from '#/api/queryKeys'
import { failedBeforeLoad, hasRefetchFailed, refetchFailedQueries } from '#/api/refetch'
import type { CalendarCutover } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

import {
  CUTOVER_LOAD_ERROR_MESSAGE,
  cutoverErrorMessage,
  loadErrorMessage,
} from '../lib/errorMessage'
import {
  cutoverStatusQueryOptions,
  facilityQueryOptions,
  useCancelCutover,
  useCompleteCutover,
  useStartCutover,
} from '../queries'
import { CalendarCutoverCancelDialog } from './CalendarCutoverCancelDialog'
import { CalendarCutoverView, type CalendarCutoverViewState } from './CalendarCutoverView'

/**
 * 予定の管理を buddy に移す画面。事業所の予定の管理先と移行の状況を読み、移行を始める、完了する、やめるの操作を渡す。
 * 完了の確認を満たさなければ、満たさない一覧を出す。やめる前に、確認のダイアログを開く。
 */
export const CalendarCutoverContainer = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  const cutoverQuery = useQuery(cutoverStatusQueryOptions(api, facilityId))
  const start = useStartCutover()
  const complete = useCompleteCutover()
  const cancel = useCancelCutover()
  // やめる前の確認を開いた移行。ほかの画面でやめた後に始め直した移行では、ダイアログを開かない
  const [cancelTargetId, setCancelTargetId] = useState<CalendarCutover['id'] | null>(null)

  const screenQueries = [facilityQuery, cutoverQuery]
  const failed = failedBeforeLoad(screenQueries)
  const completion = complete.data
  const open = cutoverQuery.data?.cutover ?? null
  const state: CalendarCutoverViewState =
    failed !== undefined
      ? { status: 'error', message: loadErrorMessage(failed.error, CUTOVER_LOAD_ERROR_MESSAGE) }
      : completion !== undefined && 'completed' in completion
        ? { status: 'completed' }
        : facilityQuery.data === undefined || cutoverQuery.data === undefined
          ? { status: 'loading' }
          : open !== null
            ? { status: 'open', cutover: open, calendars: cutoverQuery.data.calendars }
            : facilityQuery.data.sourceMode === 'buddy_primary'
              ? { status: 'buddy_primary' }
              : { status: 'not_started', calendars: cutoverQuery.data.calendars }

  const retry = () =>
    Promise.all(
      [queryKeys.facilityDetail(facilityId), queryKeys.calendars.cutover(facilityId)].map(
        (queryKey) => queryClient.resetQueries({ queryKey }),
      ),
    )

  return (
    <>
      <CalendarCutoverView
        completeError={complete.isError ? cutoverErrorMessage(complete.error) : undefined}
        importHref={(staffId) => `/schedule/import?staff=${encodeURIComponent(staffId)}`}
        isCompleting={complete.isPending}
        isStarting={start.isPending}
        onCancel={() => {
          cancel.reset()
          setCancelTargetId(open?.id ?? null)
        }}
        onComplete={() => {
          if (open !== null) complete.mutate(open.id)
        }}
        onRefetch={() => refetchFailedQueries(screenQueries)}
        onRetry={retry}
        refetchFailed={hasRefetchFailed(screenQueries)}
        onStart={() => {
          complete.reset()
          start.mutate()
        }}
        startError={start.isError ? cutoverErrorMessage(start.error) : undefined}
        state={state}
        unmet={completion !== undefined && 'unmet' in completion ? completion.unmet : undefined}
      />
      {open !== null && cancelTargetId === open.id && (
        <CalendarCutoverCancelDialog
          errorMessage={cancel.isError ? cutoverErrorMessage(cancel.error) : undefined}
          isSubmitting={cancel.isPending}
          onCancel={() => setCancelTargetId(null)}
          onSubmit={() =>
            cancel.mutate(open.id, {
              onSuccess: () => {
                setCancelTargetId(null)
                complete.reset()
                start.reset()
              },
            })
          }
        />
      )}
    </>
  )
}
