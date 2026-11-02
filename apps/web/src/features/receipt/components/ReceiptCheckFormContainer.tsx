import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { MAX_RECEIPT_UPLOAD_BYTES } from '#/api/bff/receiptCall'
import { ApiError, type ReceiptCheckInput } from '#/api/BuddyApi'

import { TOO_LARGE_MESSAGE, checkErrorMessage, csvErrorLines } from '../lib/errorMessage'
import { isMonth, previousMonth } from '../lib/month'
import { receiptResultKey, type ReceiptResult } from '../queries'
import { ReceiptCheckForm, type ScheduleSource } from './ReceiptCheckForm'

/** 照合の入力を持ち、照合の API に送り、結果の画面へ移る。入力を変えたら、前の失敗の文を消す。 */
export const ReceiptCheckFormContainer = () => {
  const { receiptApi } = useRouteContext({ from: '__root__' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [source, setSource] = useState<ScheduleSource>('calendar')
  const [month, setMonth] = useState(() => previousMonth(new Date()))
  const [schedules, setSchedules] = useState<File | null>(null)
  const [visits, setVisits] = useState<File | null>(null)

  const check = useMutation({
    mutationFn: (input: ReceiptCheckInput) => receiptApi.check(input),
    onSuccess: async (report, input) => {
      const result: ReceiptResult = {
        report,
        month: input.month,
        checkedAt: new Date().toISOString(),
      }
      queryClient.setQueryData(receiptResultKey, result)
      await navigate({ to: '/receipt/result' })
    },
  })

  const scheduleFile = source === 'csv' ? schedules : null
  const tooLarge = (visits?.size ?? 0) + (scheduleFile?.size ?? 0) > MAX_RECEIPT_UPLOAD_BYTES
  const ready = visits !== null && (source === 'calendar' ? isMonth(month) : scheduleFile !== null)
  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      check.reset()
    }

  const submit = () => {
    if (visits === null) return
    check.mutate(
      source === 'calendar' ? { visits, month } : { visits, schedules: scheduleFile as File },
    )
  }

  return (
    <ReceiptCheckForm
      source={source}
      onSourceChange={changed((next: ScheduleSource) => {
        setSource(next)
        setSchedules(null)
      })}
      month={month}
      onMonthChange={changed(setMonth)}
      onSchedulesChange={changed(setSchedules)}
      onVisitsChange={changed(setVisits)}
      canSubmit={ready && !tooLarge}
      isSubmitting={check.isPending}
      onSubmit={submit}
      errorMessage={
        tooLarge ? TOO_LARGE_MESSAGE : check.isError ? checkErrorMessage(check.error) : undefined
      }
      errorLines={
        !tooLarge && check.error instanceof ApiError ? csvErrorLines(check.error.csvErrors) : []
      }
    />
  )
}
