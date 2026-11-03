import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { RECEIPT_CHECK } from '#/api/permissions'
import { ReceiptResultContainer } from '#/features/receipt/components/ReceiptResultContainer'

export const Route = createFileRoute('/receipt/result')({
  beforeLoad: requirePermission(RECEIPT_CHECK),
  // 結果はブラウザの query の cache にだけあるので、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合の結果 | buddy' }] }),
  component: ReceiptResultPage,
})

function ReceiptResultPage() {
  return <ReceiptResultContainer />
}
