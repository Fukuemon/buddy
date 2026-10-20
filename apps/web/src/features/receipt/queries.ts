import { useQuery } from '@tanstack/react-query'

import type { ReceiptReport } from '#/api/types'

/** 照合の結果と、その入力の情報。結果の画面へ移るときに query の cache に置く。 */
export type ReceiptResult = {
  report: ReceiptReport
  /** Google カレンダーの対象の月。予定の CSV で照合したときは undefined。 */
  month?: string
  /** 照合した日時（ISO 8601）。 */
  checkedAt: string
}

/** 照合の結果を置く query の key。結果は API から取り直せないので、cache から消さない。 */
export const receiptResultKey = ['receipt', 'result'] as const

/** cache にある照合の結果を返す。無ければ null を返す。画面を読み直すと結果は消える。 */
export const useReceiptResult = () =>
  useQuery<ReceiptResult | null>({
    queryKey: receiptResultKey,
    queryFn: () => null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  }).data ?? null
