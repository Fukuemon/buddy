import type { CalendarCutoverUnmet } from '#/api/types'

import { UNMET_REASON_ACTION, UNMET_REASON_LABEL, formatUnmetDateTime } from '../lib/cutover'

export type CalendarCutoverUnmetTableProps = {
  /** 完了の確認を満たさないカレンダーと予定。API の順（カレンダーの順、カレンダーの中は日時の順）のまま並べる。 */
  items: readonly CalendarCutoverUnmet[]
}

const headerCellClassName = 'px-3 py-2 text-left text-body-dense font-normal text-text-secondary'
const cellClassName = 'px-3 py-2 text-body-dense'

/**
 * 切り替えを完了できなかったときの、満たさないカレンダーと予定の一覧。職員、日時、理由、次にすることを並べる。
 * 予定のタイトルは利用者名を含むので、API が返さず、ここにも出さない。
 */
export const CalendarCutoverUnmetTable = ({ items }: CalendarCutoverUnmetTableProps) => (
  <section
    className="flex flex-col gap-2 rounded-8 border border-danger bg-danger-surface px-4 py-3"
    data-testid="calendar-cutover-unmet"
  >
    <h2 className="text-heading-sm text-danger">完了できません（{items.length} 件）</h2>
    <p className="text-body-dense">
      次のカレンダーと予定が、完了の条件を満たしていません。直してから、もう一度完了してください。
    </p>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" data-testid="calendar-cutover-unmet-table">
        <thead>
          <tr className="border-b border-border">
            <th className={headerCellClassName} scope="col">
              職員
            </th>
            <th className={headerCellClassName} scope="col">
              日時
            </th>
            <th className={headerCellClassName} scope="col">
              理由
            </th>
            <th className={headerCellClassName} scope="col">
              すること
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              className="border-b border-border bg-surface"
              data-testid={`calendar-cutover-unmet-${item.reason}`}
              // 満たさない予定は、カレンダーの理由と取り消した回で予定の ID を持たず、並びは API の順で変わらない
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
            >
              <td className={`${cellClassName} whitespace-nowrap`}>{item.staff_name}</td>
              <td className={`${cellClassName} whitespace-nowrap`}>{formatUnmetDateTime(item)}</td>
              <td className={cellClassName}>{UNMET_REASON_LABEL[item.reason]}</td>
              <td className={cellClassName}>{UNMET_REASON_ACTION[item.reason]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)
