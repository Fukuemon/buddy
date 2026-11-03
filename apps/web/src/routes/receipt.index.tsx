import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { RECEIPT_CHECK } from '#/api/types'
import { ReceiptCheckPage } from '#/features/receipt/components/ReceiptCheckPage'

export const Route = createFileRoute('/receipt/')({
  beforeLoad: requirePermission(RECEIPT_CHECK),
  // デフォルトの対象の月を、職員のデバイスの日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合 | buddy' }] }),
  component: ReceiptCheckPage,
})
