import { clsx } from 'clsx'

import type { ServiceCode, ServiceCodeRecord } from '#/api/types'

export type ServiceCodeRadioGroupProps = {
  value: ServiceCode
  /** 予定の API のサービスコードの一覧。この順と表記で選択肢を並べる。 */
  serviceCodes: readonly ServiceCodeRecord[]
  /** 選んだサービスコードを、提供時間の範囲と一緒に渡す。 */
  onChange: (serviceCode: ServiceCodeRecord) => void
}

/** 訪問のサービスコードを 1 つ選ぶ。 */
export const ServiceCodeRadioGroup = ({
  value,
  serviceCodes,
  onChange,
}: ServiceCodeRadioGroupProps) => (
  <fieldset className="flex flex-col gap-3">
    <legend className="mb-3 text-heading-sm">サービスコードを選んでください</legend>
    <div className="flex flex-wrap gap-2">
      {serviceCodes.map((serviceCode) => (
        <label
          className={clsx(
            'relative cursor-pointer rounded-8 px-3 py-2 text-body-dense ring-1 ring-inset has-[:focus-visible]:focus-ring',
            serviceCode.code === value
              ? 'bg-primary-surface font-bold text-primary ring-2 ring-primary'
              : 'ring-border-field',
          )}
          key={serviceCode.id}
        >
          {/* sr-only だと label がクリックを受け、Playwright が radio を押せない。選択肢の全面に透明で重ねる */}
          <input
            checked={serviceCode.code === value}
            className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
            data-testid={`service-code-${serviceCode.code}`}
            name="serviceCode"
            onChange={() => onChange(serviceCode)}
            type="radio"
            value={serviceCode.code}
          />
          {serviceCode.code}
        </label>
      ))}
    </div>
  </fieldset>
)
