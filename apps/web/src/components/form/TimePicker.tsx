import type { ComponentPropsWithoutRef } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import TimerIcon from '#/assets/icons/timer.svg?react'

import { FieldFrame, fieldInputClassName } from './FieldFrame'

export type TimePickerProps<T extends FieldValues> = Omit<
  ComponentPropsWithoutRef<'input'>,
  'name' | 'type' | 'value' | 'defaultValue'
> & {
  name: FieldPath<T>
  control: Control<T>
  label: string
  isWide?: boolean
}

/** 時刻の入力。値は `HH:mm` の文字列で、React Hook Form のフィールドに結び付ける。 */
export const TimePicker = <T extends FieldValues>({
  name,
  control,
  label,
  isWide,
  ...props
}: TimePickerProps<T>) => {
  const { field, fieldState } = useController({ name, control })

  return (
    <FieldFrame
      error={fieldState.error?.message}
      htmlFor={field.name}
      icon={<TimerIcon className="text-gray-500" height={20} width={20} />}
      isWide={isWide}
      label={label}
    >
      <input
        {...props}
        {...field}
        className={fieldInputClassName}
        id={field.name}
        type="time"
        value={(field.value as string | undefined) ?? ''}
      />
    </FieldFrame>
  )
}
