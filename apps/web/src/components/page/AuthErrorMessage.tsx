import { AuthCard, loginFailedMessage, type AuthMessage } from '@buddy/broker'
import { clsx } from 'clsx'
import { buttonClassName } from '@buddy/ui'

/**
 * ログインできなかった理由。failed はログインの途中の失敗、forbidden は事業所に登録されていない職員、
 * too_many_attempts はログインの試行の回数の上限を超えたときである。
 */
export type AuthErrorReason = 'failed' | 'forbidden' | 'too_many_attempts'

export type AuthErrorMessageProps = {
  reason: AuthErrorReason
  loginHref: string
}

/** failed の文言は、ID ブローカーのログインの失敗の画面と同じ定数を使う（ADR-0014）。 */
const messages: Record<AuthErrorReason, AuthMessage> = {
  failed: loginFailedMessage,
  forbidden: {
    title: 'この事業所に登録されていません',
    body: '事業所の管理者に、メールアドレスの登録を頼んでください。',
  },
  too_many_attempts: {
    title: 'しばらくログインできません',
    body: '続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。',
  },
}

/**
 * ログインに失敗したときの案内。
 * ID ブローカーのログインの画面と同じカード（@buddy/broker の AuthCard）に、ロゴ、理由、次にすることを出す。
 */
export const AuthErrorMessage = ({ reason, loginHref }: AuthErrorMessageProps) => {
  const { title, body } = messages[reason]
  return (
    <AuthCard title={title} testId="auth-error">
      <p className="text-center text-body">{body}</p>
      <a
        className={clsx(buttonClassName({ isWide: true }), 'mt-8')}
        href={loginHref}
        data-testid="auth-error-login"
      >
        もう一度ログインする
      </a>
    </AuthCard>
  )
}
