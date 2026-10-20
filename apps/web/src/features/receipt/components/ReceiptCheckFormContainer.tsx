import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { MAX_RECEIPT_UPLOAD_BYTES } from '#/api/bff/receiptCall'
import { ApiError, type ReceiptCheckInput } from '#/api/client'

import { isMonth, previousMonth } from '../lib/month'
import { receiptResultKey, type ReceiptResult } from '../queries'
import { ReceiptCheckForm, type ScheduleSource } from './ReceiptCheckForm'

/** 照合の失敗を、職員が次にすることの分かる文にする。 */
const errorMessageOf = (error: unknown) => {
  if (!(error instanceof ApiError))
    return '照合できませんでした。時間をおいて、もう一度照合してください。'
  switch (error.status) {
    case 400:
      return error.message
    case 413:
      return 'ファイルが大きすぎます。10 MB までのファイルにしてください。'
    case 422:
      // 行ごとの誤りは一覧で出す。列が無いような、ファイル全体の誤りは API の文で伝える
      return error.rowErrors.length > 0
        ? '入力の CSV に誤りがあります。次の行を直して、もう一度照合してください。'
        : `入力の CSV に誤りがあります。${error.message}`
    case 502:
      return 'Google カレンダーから予定を取れませんでした。時間をおいて、もう一度照合してください。'
    case 503:
      return 'Google カレンダーの設定がありません。予定の CSV で照合してください。'
    default:
      return '照合できませんでした。時間をおいて、もう一度照合してください。'
  }
}

/** 照合の入力を持ち、照合の API に送り、結果の画面へ移る。 */
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

  const submit = () => {
    if (visits === null) return
    check.mutate(
      source === 'calendar' ? { visits, month } : { visits, schedules: scheduleFile as File },
    )
  }

  return (
    <ReceiptCheckForm
      source={source}
      onSourceChange={(next) => {
        setSource(next)
        setSchedules(null)
      }}
      month={month}
      onMonthChange={setMonth}
      onSchedulesChange={setSchedules}
      onVisitsChange={setVisits}
      canSubmit={ready && !tooLarge}
      isSubmitting={check.isPending}
      onSubmit={submit}
      errorMessage={
        tooLarge
          ? 'ファイルが大きすぎます。10 MB までのファイルにしてください。'
          : check.isError
            ? errorMessageOf(check.error)
            : undefined
      }
      rowErrors={check.error instanceof ApiError ? check.error.rowErrors : []}
    />
  )
}
