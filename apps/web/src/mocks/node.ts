import { setupServer } from 'msw/node'

import { createReceiptHandlers } from './receiptHandlers'
import { createScheduleHandlers } from './scheduleHandlers'

/**
 * 開発サーバーのプロセスで、サーバーから 2 つの API（SCHEDULE_URL、RECEIPT_URL）へのリクエストをフェイクの handler で受ける。
 * IdP の discovery とトークンのリクエストは handler が無いので、そのまま本物へ送る。
 */
export const startApiMocks = (env: Record<string, string | undefined>) => {
  const scheduleApiUrl = env.SCHEDULE_URL
  const receiptApiUrl = env.RECEIPT_URL
  if (!scheduleApiUrl || !receiptApiUrl) {
    throw new Error('環境変数 SCHEDULE_URL と RECEIPT_URL が必要です')
  }
  setupServer(
    ...createScheduleHandlers(scheduleApiUrl),
    ...createReceiptHandlers(receiptApiUrl),
  ).listen({ onUnhandledFrame: 'bypass' })
}
