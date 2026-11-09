import { useId, type ComponentPropsWithoutRef } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { CalendarIcon } from '../../icons/CalendarIcon'

import {
  FieldFrame,
  fieldErrorProps,
  fieldInputClassName,
  showPickerOnClick,
} from '../FieldFrame/FieldFrame'

export type DatePickerProps<T extends FieldValues> = Omit<
  ComponentPropsWithoutRef<'input'>,
  'name' | 'type' | 'value' | 'defaultValue'
> & {
  name: FieldPath<T>
  control: Control<T>
  label: string
  isWide?: boolean
  /** true なら、見出しを読み上げだけに残して見せず、枠の高さを 44px にする。見出しを欄の外に置くときに使う。 */
  isLabelHidden?: boolean
}

/** 日付の入力。値は `YYYY-MM-DD` の文字列で、React Hook Form のフィールドに結び付ける。 */
export const DatePicker = <T extends FieldValues>({
  name,
  control,
  label,
  isWide,
  isLabelHidden,
  onClick,
  ...props
}: DatePickerProps<T>) => {
  const { field, fieldState } = useController({ name, control })
  const error = fieldState.error?.message
  const inputId = useId()
  const errorId = useId()

  return (
    <FieldFrame
      error={error}
      errorId={errorId}
      htmlFor={inputId}
      icon={<CalendarIcon height={20} width={20} />}
      isLabelHidden={isLabelHidden}
      isWide={isWide}
      label={label}
    >
      <input
        {...props}
        {...field}
        {...fieldErrorProps(error, errorId)}
        className={fieldInputClassName}
        id={inputId}
        onClick={(event) => {
          showPickerOnClick(event)
          onClick?.(event)
        }}
        type="date"
        value={(field.value as string | undefined) ?? ''}
      />
    </FieldFrame>
  )
}
