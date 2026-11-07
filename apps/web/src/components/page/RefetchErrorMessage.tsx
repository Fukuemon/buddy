import { Button } from '@buddy/ui'

export type RefetchErrorMessageProps = {
  /** 読めなかったデータを読み直す。読み終えた表示は消さない。 */
  onRetry: () => void
}

/**
 * 読み終えた後に読み直して読めなかったときの案内。画面の見出しの下に出し、読み終えた表示はそのまま残す。
 * 規則は docs/screens/rules.md の「エラーの見せ方」にある。
 */
export const RefetchErrorMessage = ({ onRetry }: RefetchErrorMessageProps) => (
  <div
    className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-surface px-3 py-2"
    data-testid="refetch-error"
    role="alert"
  >
    <p className="text-body text-danger">最新の情報を読み込めませんでした。</p>
    <Button data-testid="refetch-retry" onClick={onRetry} size="S" variant="secondary">
      読み直す
    </Button>
  </div>
)
