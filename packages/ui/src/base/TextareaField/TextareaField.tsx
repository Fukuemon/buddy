import { clsx } from 'clsx'
import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { fieldErrorProps } from '../FieldFrame/FieldFrame'

export type TextareaFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  /** textarea に付ける data-testid。 */
  'data-testid'?: string
}

/** 見出しつきの複数行の入力。React Hook Form のフィールドに結び付ける。 */
export const TextareaField = <T extends FieldValues>({
  control,
  name,
  label,
  placeholder = label,
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
        className={clsx(
          'min-h-40 rounded-8 p-3 text-body ring-1 ring-border-field ring-inset outline-none focus-visible:focus-ring',
          error !== undefined && 'ring-2 ring-danger',
        )}
        data-testid={testId}
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
