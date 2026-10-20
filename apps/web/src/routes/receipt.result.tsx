import { createFileRoute } from '@tanstack/react-router'

import { SiteHeaderContainer } from '#/components/site/SiteHeaderContainer'
import { ReceiptResultContainer } from '#/features/receipt/components/ReceiptResultContainer'

export const Route = createFileRoute('/receipt/result')({
  // 結果はブラウザの query の cache にだけあるので、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '照合の結果 | buddy' }] }),
  component: ReceiptResultPage,
})

function ReceiptResultPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeaderContainer current="/receipt" />
      <main className="min-w-0 p-6">
        <ReceiptResultContainer />
      </main>
    </div>
  )
}
