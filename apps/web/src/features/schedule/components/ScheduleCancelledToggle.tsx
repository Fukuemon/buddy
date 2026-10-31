export type ScheduleCancelledToggleProps = {
  /** キャンセルした予定を出しているか。 */
  checked: boolean
  onChange: (checked: boolean) => void
}

/** キャンセルした予定をカレンダーに出すかの切り替え。左のサイドバーの、職員の絞り込みの上に置く。 */
export const ScheduleCancelledToggle = ({ checked, onChange }: ScheduleCancelledToggleProps) => (
  <div className="border-b border-border px-5 py-3">
    <label className="flex min-h-11 items-center gap-2 text-body-dense">
      <input
        checked={checked}
        className="size-5"
        data-testid="calendar-show-cancelled"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      キャンセルした予定を出す
    </label>
  </div>
)
