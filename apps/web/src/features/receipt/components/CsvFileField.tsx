import { FileField } from '@buddy/ui'

export type CsvFileFieldProps = {
  label: string
  /** 欄の下に出す補足。 */
  description?: string
  onChange: (file: File | null) => void
  'data-testid'?: string
}

/** CSV のファイルを 1 つ選ぶ欄。選んだファイルの名前はブラウザの欄が表示する。 */
export const CsvFileField = ({ label, description, onChange, ...rest }: CsvFileFieldProps) => (
  <FileField
    accept=".csv,text/csv"
    data-testid={rest['data-testid']}
    hint={description}
    label={label}
    onFileChange={onChange}
  />
)
