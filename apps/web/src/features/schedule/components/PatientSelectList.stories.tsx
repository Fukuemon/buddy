import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { PatientSelectList } from './PatientSelectList'
import { storyPatients } from './storyData'

const meta = {
  title: '画面/Schedule/PatientSelectList',
  component: PatientSelectList,
  args: { patients: storyPatients, value: '', onChange: fn() },
} satisfies Meta<typeof PatientSelectList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
