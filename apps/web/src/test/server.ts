import { createOpenApiHttp } from 'openapi-msw'
import { setupServer } from 'msw/node'

import type { paths as ReceiptPaths } from '#/api/generated/receipt'
import type { paths as SchedulePaths } from '#/api/generated/schedule'
import { createReceiptHandlers } from '#/mocks/receiptHandlers'
import { createScheduleHandlers } from '#/mocks/scheduleHandlers'

/** テストで予定の API と照合の API が待ち受けるとみなす URL。 */
export const TEST_SCHEDULE_API_URL = 'http://schedule-api.test'
export const TEST_RECEIPT_API_URL = 'http://receipt-api.test'

/** テストごとに handler を上書きするときの、型の付いた http。 */
export const scheduleHttp = createOpenApiHttp<SchedulePaths>({ baseUrl: TEST_SCHEDULE_API_URL })
export const receiptHttp = createOpenApiHttp<ReceiptPaths>({ baseUrl: TEST_RECEIPT_API_URL })

/** 全てのテストが共有するフェイクの API。準備は src/test/setup.ts が行う。 */
export const server = setupServer(
  ...createScheduleHandlers(TEST_SCHEDULE_API_URL),
  ...createReceiptHandlers(TEST_RECEIPT_API_URL),
)
