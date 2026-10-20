import { buttonClassName } from '@buddy/ui'

export type PageErrorMessageProps = {
  /** 読み直しのリンクの先。今の画面の URL を渡す。 */
  reloadHref: string
}

/** 画面を描けなかったときの案内。セッションの置き場や API に届かないときに出す。 */
export const PageErrorMessage = ({ reloadHref }: PageErrorMessageProps) => (
  <section className="flex max-w-xl flex-col items-start gap-4 p-6" data-testid="page-error">
    <h1 className="text-heading-md">画面を表示できませんでした</h1>
    <p className="text-body">時間をおいて、読み直してください。</p>
    <a className={buttonClassName({ variant: 'secondary' })} href={reloadHref}>
      読み直す
    </a>
  </section>
)
