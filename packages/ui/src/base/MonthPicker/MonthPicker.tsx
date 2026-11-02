import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { FormField, formFieldControlClassName } from '../FormField/FormField'

export type MonthPickerProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'id' | 'className' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** 欄の下に出す補足の文。 */
  hint?: ReactNode
  /** 欄の下に出す誤りの文。あれば欄に aria-invalid を付ける。 */
  error?: string
  /** input に付ける data-testid。 */
  'data-testid'?: string
  /** true なら、欄を親の幅に広げる。false では 224px までにする。 */
  isWide?: boolean
}

/** 年と月を 1 つ入力する欄。ブラウザの `input type="month"` を使い、値は `YYYY-MM` の文字列。見出しを欄の上に置く。 */
export const MonthPicker = ({ label, hint, error, isWide = false, ...props }: MonthPickerProps) => (
  <FormField error={error} hint={hint} label={label}>
    {(field) => (
      <input
        {...props}
        {...field}
        className={clsx(formFieldControlClassName, !isWide && 'max-w-56')}
        type="month"
      />
    )}
  </FormField>
)
