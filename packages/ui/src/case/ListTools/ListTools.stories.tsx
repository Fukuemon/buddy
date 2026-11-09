import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { SearchBox } from '../SearchBox/SearchBox'
import { FilterSelect, ListCount, ListEmpty, ListTools } from './ListTools'

const DEPARTMENTS = [
  { value: '', label: 'すべて' },
  { value: 'nursing', label: '看護部' },
  { value: 'rehab', label: 'リハビリ部' },
]

const meta = {
  title: 'コンポーネント/Case/ListTools',
  component: ListTools,
  args: { children: null },
  render: function Render() {
    const [department, setDepartment] = useState('')
    return (
      <ListTools>
        <SearchBox aria-label="職員を検索" onSearch={fn()} placeholder="職員を検索" />
        <FilterSelect
          label="部署"
          onChange={setDepartment}
          options={DEPARTMENTS}
          value={department}
        />
        <ListCount>12 人</ListCount>
      </ListTools>
    )
  },
} satisfies Meta<typeof ListTools>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 値を選んだ絞り込みは、枠を太くし、選んだ名前を出す。 */
export const Filtered: Story = {
  render: () => (
    <ListTools>
      <FilterSelect label="部署" onChange={fn()} options={DEPARTMENTS} value="nursing" />
      <FilterSelect disabled label="役職" onChange={fn()} options={DEPARTMENTS} value="" />
      <ListCount>3 人</ListCount>
    </ListTools>
  ),
}

/** 絞り込みで 0 件のときに、表の代わりに出す。 */
export const Empty: Story = {
  render: () => (
    <ListEmpty clearLabel="絞り込みを外す" message="条件に合う職員がいません" onClear={fn()} />
  ),
}
