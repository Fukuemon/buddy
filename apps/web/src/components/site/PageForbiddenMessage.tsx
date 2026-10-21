import { buttonClassName } from '@buddy/ui'

/** 職員の管理の権限が無い職員が、権限の要る画面を開いたときの案内。 */
export const PageForbiddenMessage = () => (
  <section className="flex max-w-xl flex-col items-start gap-4" data-testid="page-forbidden">
    <h1 className="text-heading-md">この画面を開く権限がありません</h1>
    <p className="text-body">
      職員の管理の権限を持つ職員だけが開けます。権限が要るときは、職員の管理の権限を持つ職員に頼んでください。
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
