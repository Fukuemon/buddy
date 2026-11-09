import { buttonClassName } from '@buddy/ui'

export type PageForbiddenMessageProps = {
  /** 画面を開くのに要る権限の名前。デフォルトは職員の管理である。 */
  policyName?: string
}

/** 権限が無い職員が、権限の要る画面を開いたときの案内。権限は、職員の管理の権限を持つ職員が足す。 */
export const PageForbiddenMessage = ({ policyName = '職員の管理' }: PageForbiddenMessageProps) => (
  <section className="flex max-w-xl flex-col items-start gap-4" data-testid="page-forbidden">
    <h1 className="text-heading-md">この画面を開く権限がありません</h1>
    <p className="text-body">
      {policyName}
      の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。
    </p>
    <a
      className={buttonClassName({ variant: 'secondary' })}
      data-testid="page-forbidden-back"
      href="/schedule"
    >
      予定のカレンダーへ
    </a>
  </section>
)
