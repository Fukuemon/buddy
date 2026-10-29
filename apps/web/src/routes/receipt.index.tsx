import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { CalendarHeaderToolsContainer } from '#/features/calendar/components/CalendarHeaderToolsContainer'
import { ReceiptCheckFormContainer } from '#/features/receipt/components/ReceiptCheckFormContainer'

export const Route = createFileRoute('/receipt/')({
  // デフォルトの対象の月を、職員のデバイスの日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合 | buddy' }] }),
  component: ReceiptPage,
})

function ReceiptPage() {
  return (
    <SiteLayoutContainer current="/receipt" tools={<CalendarHeaderToolsContainer />}>
      <main className="flex flex-col gap-6 p-6">
        <h1 className="text-heading-md">照合</h1>
        <p className="max-w-2xl text-body">
          予定と、電子カルテから書き出した実績の CSV
          を比べ、食い違いを不整合、予定のみ、実績のみ、整合の 4 つに分けます。
        </p>
        <ReceiptCheckFormContainer />
      </main>
    </SiteLayoutContainer>
  )
}
