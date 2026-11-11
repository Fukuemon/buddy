import { buttonClassName } from '@buddy/ui'

export type PageUnavailableMessageProps = {
  /** 読み直しのリンクの先。今の画面の URL を渡す。 */
  reloadHref: string
}

/**
 * ログインの仕組みの障害で、ログインしたままの職員を一時的に確認できないときの案内。ログインは残るので、読み直せば画面が出る。
 * 仕様は docs/screens/index.md の「一時的に使えない」にある。
 */
export const PageUnavailableMessage = ({ reloadHref }: PageUnavailableMessageProps) => (
  <section className="flex max-w-xl flex-col items-start gap-4 p-6" data-testid="page-unavailable">
    <h1 className="text-heading-md">buddy を一時的に使えません</h1>
    <p className="text-body">ログインしたまま、しばらく待ってから読み直してください。</p>
    <a className={buttonClassName({ variant: 'secondary' })} href={reloadHref}>
      読み直す
    </a>
  </section>
)
