import { clsx } from 'clsx'

import { SERVICE_CODES, type ServiceCode } from '#/api/types'

export type ServiceCodeRadioGroupProps = {
  value: ServiceCode
  onChange: (serviceCode: ServiceCode) => void
}

/** 訪問のサービスコードを 1 つ選ぶ。 */
export const ServiceCodeRadioGroup = ({ value, onChange }: ServiceCodeRadioGroupProps) => (
  <fieldset className="flex flex-col gap-3">
    <legend className="mb-3 text-heading-sm">サービスコードを選んでください</legend>
    <div className="flex flex-wrap gap-2">
      {SERVICE_CODES.map((code) => (
        <label
          className={clsx(
            'relative cursor-pointer rounded-8 px-3 py-2 text-body-dense ring-1 ring-inset has-[:focus-visible]:focus-ring',
            code === value
              ? 'bg-primary-surface font-bold text-primary ring-2 ring-primary'
              : 'ring-border-field',
          )}
          key={code}
        >
          {/* sr-only だと label がクリックを受け、Playwright が radio を押せない。選択肢の全面に透明で重ねる */}
          <input
            checked={code === value}
            className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
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
