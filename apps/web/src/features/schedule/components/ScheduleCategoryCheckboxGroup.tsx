import { clsx } from 'clsx'

import { SCHEDULE_CATEGORIES, type ScheduleCategory } from '#/api/types'

import { SCHEDULE_CATEGORY_LABEL } from '../constants/scheduleLabels'

export type ScheduleCategoryCheckboxGroupProps = {
  value: ScheduleCategory[]
  onChange: (categories: ScheduleCategory[]) => void
}

/** 訪問の種類（夜勤、緊急、入院）を複数選ぶ。何も選ばなければ通常の訪問である。 */
export const ScheduleCategoryCheckboxGroup = ({
  value,
  onChange,
}: ScheduleCategoryCheckboxGroupProps) => (
  <fieldset className="flex flex-col gap-3">
    <legend className="mb-3 text-lg font-bold">訪問の種類を選んでください</legend>
    {SCHEDULE_CATEGORIES.map((category) => {
      const checked = value.includes(category)
      return (
        <label
          className={clsx(
            'flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset',
            checked ? 'bg-action-bg ring-action-main' : 'ring-gray-200',
          )}
          key={category}
        >
          <input
            checked={checked}
            data-testid={`schedule-category-${category}`}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, category]
                  : value.filter((item) => item !== category),
              )
            }
            type="checkbox"
          />
          {SCHEDULE_CATEGORY_LABEL[category]}
        </label>
      )
    })}
  </fieldset>
)
