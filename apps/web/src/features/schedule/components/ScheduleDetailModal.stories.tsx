import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleDetailModal } from './ScheduleDetailModal'
import { storyPatients, storySchedules, storyStaff } from './storyData'

const [visit, , normal, , , cancelled] = storySchedules

const meta = {
  title: '画面/Schedule/ScheduleDetailModal',
  component: ScheduleDetailModal,
  args: {
    schedule: visit!,
    staff: storyStaff[0],
    patient: storyPatients[0],
    onEdit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ScheduleDetailModal>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = {
  args: { schedule: normal!, staff: storyStaff[2], patient: undefined },
}

/** キャンセルした訪問の予定。理由を出し、編集のボタンを出さない。 */
export const Cancelled: Story = {
  args: { schedule: cancelled!, staff: storyStaff[3], patient: storyPatients[2] },
}
