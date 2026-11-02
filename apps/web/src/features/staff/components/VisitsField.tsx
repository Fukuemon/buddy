import { SegmentedControl } from '@buddy/ui'

/** 訪問するかの選択肢の id。 */
export type VisitsOption = 'visits' | 'non-visiting'

const OPTIONS = [
  { id: 'visits', label: '訪問する' },
  { id: 'non-visiting', label: '訪問しない' },
] as const

export type VisitsFieldProps = {
  value: boolean
  onChange: (visits: boolean) => void
  /** 組の testid。選択肢の radio には `<testid>-visits` と `<testid>-non-visiting` を付ける。 */
  testId: string
}

/**
 * 職員の登録と編集で、訪問するかを選ぶ欄。訪問しない職員は、予定のカレンダーの列と、予定と担当の候補に出ない（ADR-0022）。
 * 役職からは決めないので、事務の職員を登録するときは「訪問しない」を選ぶ。
 */
export const VisitsField = ({ value, onChange, testId }: VisitsFieldProps) => (
  <div className="flex flex-col gap-3">
    <span aria-hidden className="text-label">
      訪問
    </span>
    <SegmentedControl<VisitsOption>
      data-testid={testId}
      label="訪問"
      onChange={(id) => onChange(id === 'visits')}
      options={OPTIONS}
      value={value ? 'visits' : 'non-visiting'}
    />
    <span className="text-caption text-text-secondary">
      訪問しない職員は、予定のカレンダーの列と、予定と担当の候補に出ません。
    </span>
  </div>
)
