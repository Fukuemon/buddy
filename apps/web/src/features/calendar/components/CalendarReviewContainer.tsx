import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { CalendarExportIssue } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { useBuddyApi } from '#/api/useBuddyApi'

import {
  REVIEW_LOAD_ERROR_MESSAGE,
  acceptErrorMessage,
  loadErrorMessage,
  rewriteErrorMessage,
} from '../lib/errorMessage'
import { formatExportIssueDateTime, isCancelledSingleIssue } from '../lib/exportIssue'
import { exportIssueListQueryOptions, useAcceptExport, useRetryExport } from '../queries'
import { CalendarAcceptDialog } from './CalendarAcceptDialog'
import { CalendarReviewDialog } from './CalendarReviewDialog'
import { CalendarReviewView, type CalendarReviewViewState } from './CalendarReviewView'
import { CalendarRewriteDialog } from './CalendarRewriteDialog'

/**
 * 開いているダイアログ。detail は予定の確認のダイアログで、rewrite と accept はそこから開く確認のダイアログである。
 * 予定は、送った後に一覧を読み直しても消えないよう、開いたときの値を持つ。
 */
type DialogTarget = { step: 'detail' | 'rewrite' | 'accept'; issue: CalendarExportIssue }

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

  const show = (step: DialogTarget['step'] | null, issue?: CalendarExportIssue) => {
    rewrite.reset()
    accept.reset()
    setTarget(step === null || issue === undefined ? null : { step, issue })
  }
  const label =
    target === null ? '' : `${formatExportIssueDateTime(target.issue)}、${target.issue.staff_name}`

  return (
    <>
      <CalendarReviewView
        onRetry={() =>
          queryClient.resetQueries({ queryKey: queryKeys.calendars.exportIssues(facilityId) })
        }
        onSelect={(exportId) =>
          show(
            'detail',
            issuesQuery.data?.find((i) => i.id === exportId),
          )
        }
        state={state}
      />
      {target?.step === 'detail' && (
        <CalendarReviewDialog
          issue={target.issue}
          onAccept={() => show('accept', target.issue)}
          onClose={() => show(null)}
          onOpenSchedule={(scheduleId) =>
            navigate({ to: '/schedule/$scheduleId', params: { scheduleId } })
          }
          onRewrite={() => show('rewrite', target.issue)}
        />
      )}
      {target?.step === 'rewrite' && (
        <CalendarRewriteDialog
          isCancelled={isCancelledSingleIssue(target.issue)}
          errorMessage={rewrite.isError ? rewriteErrorMessage(rewrite.error) : undefined}
          isSubmitting={rewrite.isPending}
          onCancel={() => show('detail', target.issue)}
          onSubmit={() => rewrite.mutate(target.issue.id, { onSuccess: () => show(null) })}
          target={label}
        />
      )}
      {target?.step === 'accept' && (
        <CalendarAcceptDialog
          errorMessage={accept.isError ? acceptErrorMessage(accept.error) : undefined}
          isSubmitting={accept.isPending}
          onCancel={() => show('detail', target.issue)}
          onSubmit={() => accept.mutate(target.issue.id, { onSuccess: () => show(null) })}
          target={label}
        />
      )}
    </>
  )
}

/**
 * 確認が必要な予定の画面。
 * 行を押すと予定の確認のダイアログを開き、buddy の内容で書き直すか Google の内容に合わせるかを、確認のダイアログで確定してから行う。
 * 確認のダイアログの「キャンセル」は、予定の確認のダイアログに戻る。
 */
export const CalendarReviewContainer = () => {
  return <CalendarReviewContent />
}
