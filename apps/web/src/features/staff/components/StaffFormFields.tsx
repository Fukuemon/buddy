import { Select, type SelectProps } from '@buddy/ui'

export type StaffSelectProps = Omit<SelectProps, 'children'> & {
  options: readonly { id: string; name: string }[] | undefined
}

/** 部署、チーム、役職の選択の欄。選択肢を読み終えるまでは押せない。 */
export const StaffSelect = ({ options, disabled, ...props }: StaffSelectProps) => (
  <Select disabled={disabled === true || options === undefined} {...props}>
    {options?.map((option) => (
      <option key={option.id} value={option.id}>
        {option.name}
      </option>
    ))}
  </Select>
)

/** 名前の順に並べた選択肢を返す。 */
export const sortByName = <T extends { name: string }>(items: readonly T[] | undefined) =>
  items === undefined ? undefined : [...items].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
