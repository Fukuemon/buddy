import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { fieldControlClassName } from '../FieldFrame/fieldClassName'
import { FormField } from '../FormField/FormField'

export type FileFieldProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'id' | 'className' | 'onChange' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** 欄の下に出す補足の文。選べるファイルの種類と大きさを書く。 */
  hint?: ReactNode
  /** 欄の下に出す誤りの文。あれば欄に aria-invalid を付ける。 */
  error?: string
  /** input に付ける data-testid。 */
  'data-testid'?: string
  /** 選んだファイルを渡す。選び直して取り消したときは null を渡す。複数を選べる欄では最初の 1 つを渡す。 */
  onFileChange: (file: File | null) => void
}

/** ファイルを 1 つ選ぶ欄。ブラウザの `input type="file"` を使い、選んだファイルの名前はブラウザの欄が表示する。見出しを欄の上に置く。 */
export const FileField = ({ label, hint, error, onFileChange, ...props }: FileFieldProps) => (
  <FormField error={error} hint={hint} label={label}>
    {(field) => (
      <input
        {...props}
        {...field}
        className={clsx(
          'min-h-11 w-full p-2 text-body',
          'file:mr-4 file:min-h-10 file:cursor-pointer file:rounded-8 file:border-0 file:bg-surface-subtle file:px-4 file:text-label disabled:file:cursor-default',
          fieldControlClassName,
        )}
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        type="file"
      />
    )}
  </FormField>
)
