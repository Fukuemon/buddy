import { useId, type ComponentPropsWithoutRef } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { TimerIcon } from '../../icons/TimerIcon'

import {
  FieldFrame,
  fieldErrorProps,
  fieldInputClassName,
  showPickerOnClick,
} from '../FieldFrame/FieldFrame'

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
  onClick,
  ...props
}: TimePickerProps<T>) => {
  const { field, fieldState } = useController({ name, control })
  const error = fieldState.error?.message
  const inputId = useId()
  const errorId = useId()

  return (
    <FieldFrame
      error={error}
      errorId={errorId}
      htmlFor={inputId}
      icon={<TimerIcon className="text-text-secondary" height={20} width={20} />}
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
        type="time"
        value={(field.value as string | undefined) ?? ''}
      />
    </FieldFrame>
  )
}
