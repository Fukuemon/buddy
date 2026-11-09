import { PageLead } from '#/components/page/PageLead'

import { ReceiptCategoryGuide } from './ReceiptCategoryGuide'
import { ReceiptCheckFormContainer } from './ReceiptCheckFormContainer'

/**
 * 照合の画面の中身。見出し、照合の説明と区分の案内、照合の入力のフォームを縦に並べる。
 * 画面の枠と余白は、root の route が持つ。
 */
export const ReceiptCheckPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="text-heading-md">照合</h1>
    <PageLead more={<ReceiptCategoryGuide />} testId="receipt-more">
      予定と、電子カルテから書き出した実績を比べ、食い違いを見つけます。
    </PageLead>
    <ReceiptCheckFormContainer />
  </div>
)
