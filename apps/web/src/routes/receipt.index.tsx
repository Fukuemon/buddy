import { createFileRoute } from '@tanstack/react-router'

import { PageLead } from '#/components/page/PageLead'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { ReceiptCategoryGuide } from '#/features/receipt/components/ReceiptCategoryGuide'
import { ReceiptCheckFormContainer } from '#/features/receipt/components/ReceiptCheckFormContainer'
import { ReceiptPermissionGate } from '#/features/receipt/components/ReceiptPermissionGate'

export const Route = createFileRoute('/receipt/')({
  // デフォルトの対象の月を、職員のデバイスの日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合 | buddy' }] }),
  component: ReceiptPage,
})

function ReceiptPage() {
  return (
    <SiteLayoutContainer current="/receipt" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="flex flex-col gap-6 p-6">
        <ReceiptPermissionGate>
          <h1 className="text-heading-md">照合</h1>
          <PageLead more={<ReceiptCategoryGuide />} testId="receipt-more">
            予定と、電子カルテから書き出した実績を比べ、食い違いを見つけます。
          </PageLead>
          <ReceiptCheckFormContainer />
        </ReceiptPermissionGate>
      </main>
    </SiteLayoutContainer>
  )
}
