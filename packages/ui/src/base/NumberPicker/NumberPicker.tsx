import { useId, type ComponentPropsWithoutRef } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { FieldFrame, fieldErrorProps, fieldInputClassName } from '../FieldFrame/FieldFrame'

export type NumberPickerProps<T extends FieldValues> = Omit<
  ComponentPropsWithoutRef<'input'>,
  'name' | 'type' | 'value' | 'defaultValue'
> & {
  name: FieldPath<T>
  control: Control<T>
  label: string
  isWide?: boolean
}

/** 数の入力。値は number で、React Hook Form のフィールドに結び付ける。 */
export const NumberPicker = <T extends FieldValues>({
  name,
  control,
  label,
  isWide,
  ...props
}: NumberPickerProps<T>) => {
  const { field, fieldState } = useController({ name, control })
  const error = fieldState.error?.message
  const errorId = useId()

  return (
    <FieldFrame error={error} errorId={errorId} htmlFor={field.name} isWide={isWide} label={label}>
      <input
        {...props}
        {...field}
        {...fieldErrorProps(error, errorId)}
        className={fieldInputClassName}
        id={field.name}
        onChange={(event) => field.onChange(event.target.valueAsNumber)}
        type="number"
        value={Number.isNaN(field.value) ? '' : (field.value as number)}
      />
    </FieldFrame>
  )
}
