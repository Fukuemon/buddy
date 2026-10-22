import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import type { CalendarExportIssue } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { PageForbiddenMessage } from '#/components/site/PageForbiddenMessage'

import {
  REVIEW_LOAD_ERROR_MESSAGE,
  acceptErrorMessage,
  loadErrorMessage,
  rewriteErrorMessage,
} from '../lib/errorMessage'
import { formatExportIssueDateTime } from '../lib/exportIssue'
import {
  calendarQueryKeys,
  exportIssueListQueryOptions,
  useAcceptExport,
  useRetryExport,
} from '../queries'
import { CalendarAcceptDialog } from './CalendarAcceptDialog'
import { CalendarReviewView, type CalendarReviewViewState } from './CalendarReviewView'
import { CalendarRewriteDialog } from './CalendarRewriteDialog'

/** 開いているダイアログの操作と予定。 */
type DialogTarget = { action: 'rewrite' | 'accept'; issue: CalendarExportIssue }

const CalendarReviewContent = () => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const issuesQuery = useQuery(exportIssueListQueryOptions(api, facilityId))
  const rewrite = useRetryExport()
  const accept = useAcceptExport()
  const [target, setTarget] = useState<DialogTarget | null>(null)

  const state: CalendarReviewViewState = issuesQuery.isError
    ? { status: 'error', message: loadErrorMessage(issuesQuery.error, REVIEW_LOAD_ERROR_MESSAGE) }
    : issuesQuery.isPending
      ? { status: 'loading' }
      : { status: 'ready', issues: issuesQuery.data }

  const close = () => {
    rewrite.reset()
    accept.reset()
    setTarget(null)
  }
  const open = (action: DialogTarget['action']) => (exportId: CalendarExportIssue['id']) => {
    rewrite.reset()
    accept.reset()
    const issue = issuesQuery.data?.find((i) => i.id === exportId)
    setTarget(issue === undefined ? null : { action, issue })
  }
  const label =
    target === null ? '' : `${formatExportIssueDateTime(target.issue)}、${target.issue.staff_name}`

  return (
    <>
      <CalendarReviewView
        onOpenSchedule={(scheduleId) =>
          navigate({ to: '/schedule/$scheduleId', params: { scheduleId } })
        }
        onRetry={() =>
          queryClient.resetQueries({ queryKey: calendarQueryKeys.exportIssues(facilityId) })
        }
        onAccept={open('accept')}
        onRewrite={open('rewrite')}
        state={state}
      />
      {target?.action === 'rewrite' && (
        <CalendarRewriteDialog
          errorMessage={rewrite.isError ? rewriteErrorMessage(rewrite.error) : undefined}
          isSubmitting={rewrite.isPending}
          onCancel={close}
          onSubmit={() => rewrite.mutate(target.issue.id, { onSuccess: close })}
          target={label}
        />
      )}
      {target?.action === 'accept' && (
        <CalendarAcceptDialog
          errorMessage={accept.isError ? acceptErrorMessage(accept.error) : undefined}
          isSubmitting={accept.isPending}
          onCancel={close}
          onSubmit={() => accept.mutate(target.issue.id, { onSuccess: close })}
          target={label}
        />
      )}
    </>
  )
}

/**
 * 確かめが要る予定の画面。職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す。
 * Google カレンダーと食い違った予定を読み、buddy の内容で書き直すか、Google の内容に合わせるかを、ダイアログで確かめてから行う。
 */
export const CalendarReviewContainer = () => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canManageStaff ? <CalendarReviewContent /> : <PageForbiddenMessage />
}
