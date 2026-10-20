import { createFileRoute } from '@tanstack/react-router'

import { SiteHeaderContainer } from '#/components/site/SiteHeaderContainer'
import { ReceiptCheckFormContainer } from '#/features/receipt/components/ReceiptCheckFormContainer'

export const Route = createFileRoute('/receipt/')({
  // 既定の対象の月を、職員の端末の日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合 | buddy' }] }),
  component: ReceiptPage,
})

function ReceiptPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeaderContainer current="/receipt" />
      <main className="flex flex-col gap-6 p-6">
        <h1 className="text-heading-md">照合</h1>
        <p className="max-w-2xl text-body">
          予定と、電子カルテから書き出した実績の CSV
          を比べ、食い違いを不整合、予定のみ、実績のみ、整合の 4 つに分けます。
        </p>
        <ReceiptCheckFormContainer />
      </main>
    </div>
  )
}
