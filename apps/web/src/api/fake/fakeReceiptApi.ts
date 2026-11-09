import { mockReceiptReport } from '#/mocks/receiptData'

import type { ReceiptApi } from '../BuddyApi'

/**
 * フェイクの照合の API を作る。入力によらず、mocks の mockReceiptReport の複製を返す。
 * 照合の結果の画面の型（ReceiptReport）は照合の API の Report と同じなので、変換しない。
 */
export const createFakeReceiptApi = (): ReceiptApi => ({
  check: async () => structuredClone(mockReceiptReport),
})
