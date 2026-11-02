import { clsx } from 'clsx'
import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { fieldErrorProps } from '../FieldFrame/FieldFrame'
import { fieldControlClassName } from '../FieldFrame/fieldClassName'

export type TextareaFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  disabled?: boolean
  /** textarea に付ける data-testid。 */
  'data-testid'?: string
}

/** 見出しつきの複数行の入力。React Hook Form のフィールドに結び付ける。 */
export const TextareaField = <T extends FieldValues>({
  control,
  name,
  label,
  placeholder = label,
  disabled,
  'data-testid': testId,
}: TextareaFieldProps<T>) => {
  const { field, fieldState } = useController({ control, name })
  const error = fieldState.error?.message
  const inputId = useId()
  const errorId = useId()

  return (
    <div className="flex flex-col gap-3">
      <label className="text-heading-sm" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        {...field}
        {...fieldErrorProps(error, errorId)}
        className={clsx('min-h-40 p-3 text-body', fieldControlClassName)}
        data-testid={testId}
        disabled={disabled}
        id={inputId}
        placeholder={placeholder}
        value={(field.value as string | undefined) ?? ''}
      />
      {error !== undefined && (
        <span className="text-caption text-danger" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
