import { Button } from '@buddy/ui'
import { useEffect, useRef, useState } from 'react'

const COPIED_MS = 2000

export type CalendarShareGuideProps = {
  /** この事業所の buddy のサービスアカウントのメールアドレス。 */
  serviceAccount: string
  /** クリップボードにコピーする。デフォルトはブラウザの Clipboard API で、拒まれると reject する。 */
  copy?: (text: string) => Promise<void>
}

const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

/**
 * 職員がカレンダーをサービスアカウントに共有する手順と、サービスアカウントのメールアドレス。
 * コピーを押すとメールアドレスをコピーし、2 秒だけボタンの文字を変える。コピーできなければ、メールアドレスの文字を選ぶ。
 */
export const CalendarShareGuide = ({
  serviceAccount,
  copy = writeClipboard,
}: CalendarShareGuideProps) => {
  const [copied, setCopied] = useState(false)
  const emailRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    try {
      await copy(serviceAccount)
      setCopied(true)
    } catch {
      const email = emailRef.current
      if (email === null) return
      const range = document.createRange()
      range.selectNodeContents(email)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-8 border border-border bg-surface-subtle p-4 desktop:px-5"
      data-testid="calendar-link-guide"
    >
      <h2 className="text-heading-sm">カレンダーを共有する手順</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body">
        <li>
          職員が、Google
          カレンダーの「設定と共有」で、自分のカレンダーの「特定のユーザーまたはグループと共有する」に、次のメールアドレスを足します。
        </li>
        <li>権限は「予定の変更」を選びます。buddy の予定を、このカレンダーに書き出すためです。</li>
        <li>
          この画面で、職員の行の「結び付ける」を押し、カレンダーの ID を入れます。カレンダーの ID
          は、「カレンダーの統合」にあります。個人のカレンダーでは、職員の Google
          のメールアドレスです。
        </li>
      </ol>
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-text-secondary">
          この事業所の buddy のサービスアカウント
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <code
            className="rounded-8 border border-border bg-surface px-2.5 py-1.5 text-body-dense break-all"
            data-testid="calendar-link-service-account"
            ref={emailRef}
          >
            {serviceAccount}
          </code>
          <Button
            data-testid="calendar-link-copy"
            onClick={handleCopy}
            size="S"
            variant="secondary"
          >
            {copied ? 'コピーしました' : 'コピー'}
          </Button>
        </div>
      </div>
    </section>
  )
}
