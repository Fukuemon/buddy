import type { ComponentPropsWithoutRef } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { CalendarIcon } from '../../icons/CalendarIcon'

import { FieldFrame, fieldInputClassName } from '../FieldFrame/FieldFrame'

export type DatePickerProps<T extends FieldValues> = Omit<
  ComponentPropsWithoutRef<'input'>,
  'name' | 'type' | 'value' | 'defaultValue'
> & {
  name: FieldPath<T>
  control: Control<T>
  label: string
  isWide?: boolean
}

/** 日付の入力。値は `YYYY-MM-DD` の文字列で、React Hook Form のフィールドに結び付ける。 */
export const DatePicker = <T extends FieldValues>({
  name,
  control,
  label,
  isWide,
  ...props
}: DatePickerProps<T>) => {
  const { field, fieldState } = useController({ name, control })

  return (
    <FieldFrame
      error={fieldState.error?.message}
      htmlFor={field.name}
      icon={<CalendarIcon height={20} width={20} />}
      isWide={isWide}
      label={label}
    >
      <input
        {...props}
        {...field}
        className={fieldInputClassName}
        id={field.name}
        type="date"
        value={(field.value as string | undefined) ?? ''}
      />
    </FieldFrame>
  )
}
