import { useId } from 'react'

export type CsvFileFieldProps = {
  label: string
  /** 欄の下に出す補足。 */
  description?: string
  onChange: (file: File | null) => void
  'data-testid'?: string
}

/** CSV のファイルを 1 つ選ぶ欄。選んだファイルの名前はブラウザの欄が表示する。 */
export const CsvFileField = ({ label, description, onChange, ...rest }: CsvFileFieldProps) => {
  const id = useId()
  const descriptionId = `${id}-description`
  return (
    <div className="flex flex-col gap-3">
      <label className="text-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        aria-describedby={description === undefined ? undefined : descriptionId}
        className="min-h-11 rounded-8 bg-surface p-2 text-body ring-1 ring-border-field ring-inset file:mr-4 file:min-h-10 file:cursor-pointer file:rounded-8 file:border-0 file:bg-surface-subtle file:px-4 file:text-label focus-visible:focus-ring"
        data-testid={rest['data-testid']}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {description !== undefined && (
        <span className="text-caption text-text-secondary" id={descriptionId}>
          {description}
        </span>
      )}
    </div>
  )
}
