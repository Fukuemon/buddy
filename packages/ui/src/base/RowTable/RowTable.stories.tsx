import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ActionMenu } from '../ActionMenu/ActionMenu'
import { Button } from '../Button/Button'
import { RowTable, RowTableRow, type RowTableProps } from './RowTable'

const MOBILE = { viewport: { value: 'mobile2', isRotated: false } }

type StoryArgs = RowTableProps & {
  /** 行を押したときと、行の操作を選んだときに、行の名前を渡して呼ぶ。 */
  onSelect: (name: string) => void
}

const SCHEDULES = [
  {
    name: '青木 一郎',
    time: '11月4日（水） 10:00〜11:00',
    staff: '石井 花子',
    reason: 'Google カレンダーで時間が変わりました',
    changedAt: '11月1日 9:30',
  },
  {
    name: '上田 美咲',
    time: '11月5日（木） 14:00〜15:00',
    staff: '江藤 次郎',
    reason: 'buddy に無い予定が Google カレンダーにあります',
    changedAt: '11月1日 10:05',
  },
]

const meta = {
  title: 'コンポーネント/Base/RowTable',
  component: RowTable,
  args: {
    primaryHeader: '利用者',
    metaHeaders: ['予定の日時', '職員', '理由', '最後に変わった日時'],
    onSelect: fn(),
    children: null,
  },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

/** 行のどこを押しても onSelect を呼ぶ。理由の列は、幅 768px 未満の 2 行目に出さない。 */
export const Selectable: Story = {
  render: ({ onSelect, ...args }) => (
    <RowTable {...args}>
      {SCHEDULES.map((schedule) => (
        <RowTableRow
          data-testid={`row-${schedule.name}`}
          key={schedule.name}
          meta={[
            { header: '予定の日時', value: schedule.time, isNoWrap: true },
            { header: '職員', value: schedule.staff, isNoWrap: true },
            { header: '理由', value: schedule.reason, isDesktopOnly: true },
            { header: '最後に変わった日時', value: schedule.changedAt, isNoWrap: true },
          ]}
          name={schedule.name}
          onSelect={() => onSelect(schedule.name)}
        />
      ))}
    </RowTable>
  ),
}

/** 行のどこを押しても href の先へ移る。状態の印の列を足す。 */
export const WithHref: Story = {
  args: {
    primaryHeader: '職員',
    metaHeaders: ['メールアドレス'],
    statusHeader: '状態',
  },
  render: ({ onSelect: _onSelect, ...args }) => (
    <RowTable {...args}>
      <RowTableRow
        data-testid="row-ishii"
        href="#ishii"
        meta={[{ header: 'メールアドレス', value: 'staff-a@example.com' }]}
        name="石井 花子"
        status={
          <span className="rounded-4 bg-warning-surface px-2 py-0.5 text-caption text-warning">
            要確認
          </span>
        }
      />
      <RowTableRow
        data-testid="row-eto"
        href="#eto"
        meta={[{ header: 'メールアドレス', value: 'staff-b@example.com' }]}
        name="江藤 次郎"
        status={
          <span className="rounded-4 bg-success-surface px-2 py-0.5 text-caption text-success">
            連携済み
          </span>
        }
      />
    </RowTable>
  ),
}

/** 詳細の無い一覧で、行の右端に操作を置く。行そのものは押せない。 */
export const WithAction: Story = {
  args: {
    primaryHeader: '職員',
    metaHeaders: ['メールアドレス', '最後に取り込んだ日時'],
    trailingHeader: '操作',
  },
  render: ({ onSelect, ...args }) => (
    <RowTable {...args}>
      <RowTableRow
        action={
          <Button
            data-testid="row-ishii-link"
            onClick={() => onSelect('石井 花子')}
            size="S"
            variant="secondary"
          >
            結び付ける
          </Button>
        }
        data-testid="row-ishii"
        meta={[
          { header: 'メールアドレス', value: 'staff-a@example.com' },
          { header: '最後に取り込んだ日時', value: null, emptyLabel: 'まだ取り込んでいません' },
        ]}
        name="石井 花子"
      />
      <RowTableRow
        action={
          <ActionMenu
            data-testid="row-eto-menu"
            items={[
              {
                label: '取り込む',
                onSelect: () => onSelect('江藤 次郎'),
                'data-testid': 'row-eto-import',
              },
              {
                label: '外す',
                onSelect: () => onSelect('江藤 次郎'),
                'data-testid': 'row-eto-remove',
                isDanger: true,
              },
            ]}
            label="江藤 次郎の操作"
          />
        }
        data-testid="row-eto"
        meta={[
          { header: 'メールアドレス', value: 'staff-b@example.com' },
          { header: '最後に取り込んだ日時', value: '11月1日 9:30', isNoWrap: true },
        ]}
        name="江藤 次郎"
      />
    </RowTable>
  ),
}

/** 幅 768px 未満では、1 行目に名前、2 行目に補足の値を「・」でつなげて出す。 */
export const Mobile: Story = { ...Selectable, globals: MOBILE }
