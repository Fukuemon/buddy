import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { RecurringRule } from '#/api/types'

import { toRecurringRuleFormValues, type RecurringRuleFormShape } from '../schema/recurringRuleForm'
import { RecurringRuleFields } from './RecurringRuleFields'

type FieldsStoryProps = {
  /** 今の規則。null の項目は baseDate から決める。 */
  rule: RecurringRule
  /** 規則の空の項目を決める日（YYYY-MM-DD）。 */
  baseDate: string
  /** 渡すと、終了日の欄にこの誤りの文を出す。 */
  endDateError?: string
}

/** 繰り返しの欄を、rule と baseDate から作った値のフォームで描く。 */
const FieldsStory = ({ rule, baseDate, endDateError }: FieldsStoryProps) => {
  const form = useForm<RecurringRuleFormShape>({
    defaultValues: { recurrence: toRecurringRuleFormValues(rule, baseDate) },
  })
  useEffect(() => {
    if (endDateError !== undefined) {
      form.setError('recurrence.endDate', { type: 'custom', message: endDateError })
    }
  }, [form, endDateError])
  return <RecurringRuleFields baseDate={baseDate} form={form} />
}

const meta = {
  title: '画面/Schedule/RecurringRuleFields',
  component: FieldsStory,
  args: {
    rule: {
      frequency: 'weekly',
      dayOfWeek: 2,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: '2027-03-31',
    },
    baseDate: '2026-10-20',
  },
} satisfies Meta<typeof FieldsStory>

export default meta
type Story = StoryObj<typeof meta>

/** 毎週火曜で、終了日を決めた繰り返し。 */
export const Weekly: Story = {}

/** 毎月 20 日の、終了日の無い繰り返し。 */
export const MonthlyDay: Story = {
  args: {
    rule: {
      frequency: 'monthly',
      dayOfWeek: null,
      dayOfMonth: 20,
      weekOfMonth: null,
      endDate: null,
    },
  },
}

/** 毎月第 3 火曜の、終了日の無い繰り返し。 */
export const MonthlyWeekday: Story = {
  args: {
    rule: { frequency: 'monthly', dayOfWeek: 2, dayOfMonth: null, weekOfMonth: 3, endDate: null },
  },
}

/** 終了日が早すぎる誤りを出した形。 */
export const Invalid: Story = {
  args: {
    rule: {
      frequency: 'weekly',
      dayOfWeek: 2,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: '2026-10-01',
    },
    endDateError: '繰り返しを変えるときは、終了日を 2026-10-20 以降にしてください',
  },
}

/** 選択肢（毎週火曜、毎月 20 日、毎月第 3 火曜）のどれとも違う毎週木曜。「カスタム…」を開いた形で始める。 */
export const Custom: Story = {
  args: {
    rule: { frequency: 'weekly', dayOfWeek: 4, dayOfMonth: null, weekOfMonth: null, endDate: null },
  },
}
