import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, RECEIPT_CHECK } from '#/api/permissions'
import { ReceiptCheckPage } from '#/features/receipt/components/ReceiptCheckPage'

export const Route = createFileRoute('/receipt/')({
  beforeLoad: requirePermission(RECEIPT_CHECK),
  // デフォルトの対象の月を、職員のデバイスの日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合 | buddy' }] }),
  component: ReceiptCheckPage,
})
