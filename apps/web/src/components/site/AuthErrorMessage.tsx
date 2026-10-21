import { buttonClassName } from '@buddy/ui'

/** ログインできなかった理由。 */
export type AuthErrorReason = 'failed' | 'forbidden'

export type AuthErrorMessageProps = {
  /** failed はログインの途中の失敗、forbidden は事業所に登録されていない職員である。 */
  reason: AuthErrorReason
  loginHref: string
}

const messages: Record<AuthErrorReason, { title: string; body: string }> = {
  failed: {
    title: 'ログインできませんでした',
    body: '時間をおいて、もう一度ログインしてください。',
  },
  forbidden: {
    title: 'この事業所に登録されていません',
    body: '事業所の管理者に、メールアドレスの登録を頼んでください。',
  },
}

/** ログインに失敗したときの案内。 */
export const AuthErrorMessage = ({ reason, loginHref }: AuthErrorMessageProps) => {
  const { title, body } = messages[reason]
  return (
    <section className="flex max-w-xl flex-col items-start gap-4" data-testid="auth-error">
      <h1 className="text-heading-md">{title}</h1>
      <p className="text-body">{body}</p>
      <a className={buttonClassName({ variant: 'secondary' })} href={loginHref}>
        もう一度ログインする
      </a>
    </section>
  )
}
