import { clsx } from 'clsx'

import { SERVICE_CODES, type ServiceCode } from '#/api/types'

export type ServiceCodeRadioGroupProps = {
  value: ServiceCode
  onChange: (serviceCode: ServiceCode) => void
}

/** 訪問のサービスコードを 1 つ選ぶ。 */
export const ServiceCodeRadioGroup = ({ value, onChange }: ServiceCodeRadioGroupProps) => (
  <fieldset className="flex flex-col gap-3">
    <legend className="mb-3 font-bold">サービスコードを選んでください</legend>
    <div className="flex flex-wrap gap-2">
      {SERVICE_CODES.map((code) => (
        <label
          className={clsx(
            'cursor-pointer rounded-xl px-3 py-2 text-sm ring-1 ring-inset',
            code === value
              ? 'bg-action-bg font-bold text-action-main ring-action-main'
              : 'ring-gray-200',
          )}
          key={code}
        >
          <input
            checked={code === value}
            className="sr-only"
            data-testid={`service-code-${code}`}
            name="serviceCode"
            onChange={() => onChange(code)}
            type="radio"
            value={code}
          />
          {code}
        </label>
      ))}
    </div>
  </fieldset>
)
