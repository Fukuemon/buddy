import { buttonClassName } from '@buddy/ui'

export type ReceiptResultEmptyProps = {
  checkHref: string
}

/** 照合の結果が無いときの案内。結果は画面を読み直すと消える。 */
export const ReceiptResultEmpty = ({ checkHref }: ReceiptResultEmptyProps) => (
  <section className="flex max-w-xl flex-col items-start gap-4" data-testid="receipt-result-empty">
    <h1 className="text-heading-md">照合の結果がありません</h1>
    <p className="text-body">
      照合の結果は保存しません。画面を読み直したときは、もう一度照合してください。
    </p>
    <a className={buttonClassName({ variant: 'secondary' })} href={checkHref}>
      照合の画面へ
    </a>
  </section>
)
