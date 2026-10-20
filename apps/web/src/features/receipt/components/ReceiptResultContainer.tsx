import { dateStamp } from '../lib/month'
import { downloadText } from '../lib/download'
import { toReceiptCsv } from '../lib/reportCells'
import { useReceiptResult } from '../queries'
import { ReceiptResultEmpty } from './ReceiptResultEmpty'
import { ReceiptResultView } from './ReceiptResultView'

const CHECK_HREF = '/receipt'

/** cache の照合の結果を表示し、CSV を保存させる。結果が無ければ照合の画面へ案内する。 */
export const ReceiptResultContainer = () => {
  const result = useReceiptResult()
  if (result === null) return <ReceiptResultEmpty checkHref={CHECK_HREF} />
  const { report, month } = result
  const [year, mm] = month?.split('-') ?? []
  return (
    <ReceiptResultView
      report={report}
      sourceLabel={
        month === undefined ? '予定の CSV' : `${year} 年 ${Number(mm)} 月の Google カレンダー`
      }
      checkAgainHref={CHECK_HREF}
      onDownload={() =>
        downloadText(
          toReceiptCsv(report),
          `照合結果_${month ?? dateStamp(new Date(result.checkedAt))}.csv`,
          'text/csv;charset=utf-8',
        )
      }
    />
  )
}
