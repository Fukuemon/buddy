import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import type { CalendarExportIssue } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/site/PageForbiddenMessage'

import {
  REVIEW_LOAD_ERROR_MESSAGE,
  loadErrorMessage,
  rewriteErrorMessage,
} from '../lib/errorMessage'
import { formatExportIssueDateTime } from '../lib/exportIssue'
import { calendarQueryKeys, exportIssueListQueryOptions, useRetryExport } from '../queries'
import { CalendarReviewView, type CalendarReviewViewState } from './CalendarReviewView'
import { CalendarRewriteDialog } from './CalendarRewriteDialog'

const CalendarReviewContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const issuesQuery = useQuery(exportIssueListQueryOptions(api, facilityId))
  const rewrite = useRetryExport()
  const [target, setTarget] = useState<CalendarExportIssue | null>(null)

  const state: CalendarReviewViewState = issuesQuery.isError
    ? { status: 'error', message: loadErrorMessage(issuesQuery.error, REVIEW_LOAD_ERROR_MESSAGE) }
    : issuesQuery.isPending
      ? { status: 'loading' }
      : { status: 'ready', issues: issuesQuery.data }

  const close = () => {
    rewrite.reset()
    setTarget(null)
  }

  return (
    <>
      <CalendarReviewView
        onOpenSchedule={(scheduleId) =>
          navigate({ to: '/schedule/$scheduleId', params: { scheduleId } })
        }
        onRetry={() =>
          queryClient.resetQueries({ queryKey: calendarQueryKeys.exportIssues(facilityId) })
        }
        onRewrite={(exportId) => {
          rewrite.reset()
          setTarget(issuesQuery.data?.find((issue) => issue.id === exportId) ?? null)
        }}
        state={state}
      />
      {target !== null && (
        <CalendarRewriteDialog
          errorMessage={rewrite.isError ? rewriteErrorMessage(rewrite.error) : undefined}
          isSubmitting={rewrite.isPending}
          onCancel={close}
          onSubmit={() => rewrite.mutate(target.id, { onSuccess: close })}
          target={`${formatExportIssueDateTime(target)}、${target.staff_name}`}
        />
      )}
    </>
  )
}

/**
 * 確かめが要る予定の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * Google カレンダーに書き出せなかった予定を読み、buddy の内容で書き直すをダイアログで確かめてから行う。
 */
export const CalendarReviewContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <CalendarReviewContent /> : <PageForbiddenMessage />
}
