import type { Meta, StoryObj } from '@storybook/react-vite'

import { Table } from './Table'

const meta = {
  title: 'Base/Table',
  component: Table,
  args: {
    children: (
      <>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell expanded>名前</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {['青木 一郎', '石川 二葉', '上田 三奈'].map((name) => (
            <Table.Row key={name}>
              <Table.Cell>{name}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </>
    ),
  },
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
