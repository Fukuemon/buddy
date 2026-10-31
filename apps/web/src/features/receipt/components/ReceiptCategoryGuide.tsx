import type { ReceiptCategory } from '#/api/types'

import { RECEIPT_CATEGORIES } from '../lib/reportCells'

const MEANING: Record<ReceiptCategory, string> = {
  mismatch: '予定と実績の両方があり、時間、サービス内容、加算のどれかが合いません。',
  schedule_only: '予定はあり、実績がありません。',
  visit_only: '実績はあり、予定がありません。',
  match: '予定と実績の両方があり、合っています。',
}

/** 照合の結果の 4 つの区分の説明。区分の名前は、照合の結果の画面の件数の見出しと同じにする。 */
export const ReceiptCategoryGuide = () => (
  <div className="flex flex-col gap-2">
    <p>訪問日、利用者名、主訪問者が同じ予定と実績を比べ、結果を次の 4 つに分けます。</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {RECEIPT_CATEGORIES.map(({ category, label }) => (
        <div className="contents" key={category}>
          <dt className="text-label">{label}</dt>
          <dd>{MEANING[category]}</dd>
        </div>
      ))}
    </dl>
  </div>
)
