import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

export type TextareaFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
}

/** 見出しつきの複数行の入力。React Hook Form のフィールドに結び付ける。 */
export const TextareaField = <T extends FieldValues>({
  control,
  name,
  label,
  placeholder = label,
}: TextareaFieldProps<T>) => {
  const { field, fieldState } = useController({ control, name })

  return (
    <div className="flex flex-col gap-3">
      <label className="text-lg font-bold" htmlFor={field.name}>
        {label}
      </label>
      <textarea
        {...field}
        className="min-h-40 rounded-xl p-3 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-action-main"
        id={field.name}
        placeholder={placeholder}
        value={(field.value as string | undefined) ?? ''}
      />
      {fieldState.error?.message !== undefined && (
        <span className="text-xs text-incorrect-main" role="alert">
          {fieldState.error.message}
        </span>
      )}
    </div>
  )
}
