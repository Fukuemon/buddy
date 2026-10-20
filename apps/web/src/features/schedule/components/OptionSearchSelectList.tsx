import { useState } from 'react'

import { SearchBox, Table } from '@buddy/ui'

export type SelectOption = {
  id: string
  name: string
}

export type OptionSearchSelectListProps = {
  heading: string
  options: SelectOption[]
  value: string
  onChange: (id: string) => void
  searchPlaceholder: string
  /** 選択肢の radio と検索欄の data-testid の接頭辞。 */
  testIdPrefix: string
}

/** 名前で絞り込める、1 つを選ぶ一覧。StaffSelectList と PatientSelectList が使う。 */
export const OptionSearchSelectList = ({
  heading,
  options,
  value,
  onChange,
  searchPlaceholder,
  testIdPrefix,
}: OptionSearchSelectListProps) => {
  const [keyword, setKeyword] = useState('')
  const visible = options.filter((option) => option.name.includes(keyword.trim()))

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-heading-sm">{heading}</h2>
      <SearchBox
        aria-label={searchPlaceholder}
        data-testid={`${testIdPrefix}-search`}
        onSearch={setKeyword}
        placeholder={searchPlaceholder}
      />
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell expanded>名前</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visible.map((option) => (
            <Table.Row key={option.id}>
              <Table.Cell>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    checked={value === option.id}
                    data-testid={`${testIdPrefix}-option-${option.id}`}
                    name={testIdPrefix}
                    onChange={() => onChange(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span>{option.name}</span>
                </label>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {visible.length === 0 && (
        <p className="text-caption text-text-secondary">該当する名前がありません。</p>
      )}
    </div>
  )
}
