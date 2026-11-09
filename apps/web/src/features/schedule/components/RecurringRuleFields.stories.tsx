import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { RecurringRule } from '#/api/types'

import {
  toRecurringRuleFormValues,
  type RecurringRuleFormShape,
  type RecurringRuleFormValues,
} from '../schema/recurringRuleForm'
import { RecurringRuleFields } from './RecurringRuleFields'

type FieldsStoryProps = {
  /** 今の規則。null の項目は baseDate から決める。 */
  rule: RecurringRule
  /** 規則の空の項目を決める日（YYYY-MM-DD）。 */
  baseDate: string
  /** 渡すと、終了日の欄にこの誤りの文を出す。 */
  endDateError?: string
  /** 渡すと、rule と baseDate から作った欄の値を、この値で上書きする。 */
  values?: Partial<RecurringRuleFormValues>
  /** 渡すと、曜日と間隔の欄にこの誤りの文を出す。 */
  weeklyErrors?: { weeklyDays?: string; interval?: string }
}

/** 繰り返しの欄を、rule と baseDate から作った値のフォームで描く。 */
const FieldsStory = ({ rule, baseDate, endDateError, values, weeklyErrors }: FieldsStoryProps) => {
  const form = useForm<RecurringRuleFormShape>({
    defaultValues: { recurrence: { ...toRecurringRuleFormValues(rule, baseDate), ...values } },
  })
  useEffect(() => {
    if (endDateError !== undefined) {
      form.setError('recurrence.endDate', { type: 'custom', message: endDateError })
    }
    if (weeklyErrors?.weeklyDays !== undefined) {
      form.setError('recurrence.weeklyDays', { type: 'custom', message: weeklyErrors.weeklyDays })
    }
    if (weeklyErrors?.interval !== undefined) {
      form.setError('recurrence.interval', { type: 'custom', message: weeklyErrors.interval })
    }
  }, [form, endDateError, weeklyErrors])
  return <RecurringRuleFields baseDate={baseDate} form={form} />
}

const meta = {
  title: '画面/Schedule/RecurringRuleFields',
  component: FieldsStory,
  args: {
    rule: {
      frequency: 'weekly',
      daysOfWeek: [2],
      interval: 1,
      dayOfWeek: null,
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
      daysOfWeek: null,
      interval: null,
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
    rule: {
      frequency: 'monthly',
      daysOfWeek: null,
      interval: null,
      dayOfWeek: 2,
      dayOfMonth: null,
      weekOfMonth: 3,
      endDate: null,
    },
  },
}

/** 終了日が早すぎる誤りを出した形。 */
export const Invalid: Story = {
  args: {
    rule: {
      frequency: 'weekly',
      daysOfWeek: [2],
      interval: 1,
      dayOfWeek: null,
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
    rule: {
      frequency: 'weekly',
      daysOfWeek: [4],
      interval: 1,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: null,
    },
  },
}

/** 隔週の月曜と木曜で、2026-10-22（木曜）の回を開いた形。今の規則の選択肢を、曜日の並びのまま選んで始める。 */
export const BiweeklyDays: Story = {
  args: {
    rule: {
      frequency: 'weekly',
      daysOfWeek: [1, 4],
      interval: 2,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: null,
    },
    baseDate: '2026-10-22',
  },
}

/** 7 つの曜日の毎週で、2026-10-20（火曜）の回を開いた形。今の規則の選択肢を選んで始める。 */
export const Daily: Story = {
  args: {
    rule: {
      frequency: 'weekly',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      interval: 1,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: null,
    },
  },
}

/** 「カスタム…」の毎週で、曜日を 1 つも選ばず、間隔を 0 にして保存を押した形。 */
export const CustomWeeklyInvalid: Story = {
  args: {
    ...Custom.args,
    values: { weeklyDays: [], interval: 0 },
    weeklyErrors: {
      weeklyDays: '曜日を 1 つ以上選んでください',
      interval: '間隔は 1〜52 の週の数で入力してください',
    },
  },
}

/** 3 週ごとの火曜。選択肢の曜日に、間隔を付けて出す。 */
export const EveryThreeWeeks: Story = {
  args: {
    rule: {
      frequency: 'weekly',
      daysOfWeek: [2],
      interval: 3,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: null,
    },
  },
}
