import type { CountBox } from '../lib/importSummary'

export type CalendarImportCountsProps = {
  boxes: readonly CountBox[]
  /** 箱ごとに testid を付けるときの接頭辞。省くと箱に testid を付けない。 */
  boxTestIdPrefix?: string
  'data-testid': string
}

/** 件数の箱を折り返して並べる。箱は、名前、件数、補足の文を縦に積む。 */
export const CalendarImportCounts = ({
  boxes,
  boxTestIdPrefix,
  'data-testid': testId,
}: CalendarImportCountsProps) => (
  <dl
    className="m-0 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3"
    data-testid={testId}
  >
    {boxes.map((box) => (
      <div
        className="rounded-8 border border-border p-3"
        data-testid={boxTestIdPrefix === undefined ? undefined : `${boxTestIdPrefix}${box.key}`}
        key={box.key}
      >
        <dt className="text-caption text-text-secondary">{box.label}</dt>
        <dd className="m-0 flex flex-col gap-1">
          <strong className="text-heading-sm">{box.count} 件</strong>
          {box.note !== '' && <span className="text-caption text-text-secondary">{box.note}</span>}
        </dd>
      </div>
    ))}
  </dl>
)
