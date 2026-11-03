import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { ReceiptResultContainer } from '#/features/receipt/components/ReceiptResultContainer'
import { ReceiptPermissionGate } from '#/features/receipt/components/ReceiptPermissionGate'

export const Route = createFileRoute('/receipt/result')({
  // 結果はブラウザの query の cache にだけあるので、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合の結果 | buddy' }] }),
  component: ReceiptResultPage,
})

function ReceiptResultPage() {
  return (
    <SiteLayoutContainer current="/receipt" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-6">
        <ReceiptPermissionGate>
          <ReceiptResultContainer />
        </ReceiptPermissionGate>
      </main>
    </SiteLayoutContainer>
  )
}
