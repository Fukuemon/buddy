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

const messages: Record<AuthErrorReason, { title: string; body: string }> = {
  failed: {
    title: 'ログインできませんでした',
    body: '時間をおいて、もう一度ログインしてください。',
  },
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
 * ブローカーのログインの画面（services/broker/internal/login/pages.go）と同じ中央のカードに、ロゴ、理由、次にすることを出す。
 */
export const AuthErrorMessage = ({ reason, loginHref }: AuthErrorMessageProps) => {
  const { title, body } = messages[reason]
  return (
    <section
      className="w-full max-w-lg rounded-8 bg-surface px-6 py-10 ring-1 ring-border desktop:px-18 desktop:py-14"
      data-testid="auth-error"
    >
      <p aria-hidden className="text-center text-heading-md text-primary">
        buddy
      </p>
      <h1 className="mt-2 mb-4 text-center text-heading-sm">{title}</h1>
      <p className="text-center text-body">{body}</p>
      <a
        className={clsx(buttonClassName({ isWide: true }), 'mt-8')}
        href={loginHref}
        data-testid="auth-error-login"
      >
        もう一度ログインする
      </a>
    </section>
  )
}
