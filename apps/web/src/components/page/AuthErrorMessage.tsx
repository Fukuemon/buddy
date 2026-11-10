import {
  AuthCard,
  loginFailedMessage,
  tooManyAttemptsMessage,
  type AuthMessage,
} from '@buddy/broker'
import { clsx } from 'clsx'
import { buttonClassName } from '@buddy/ui'

import type { AuthErrorReason } from '#/api/types'

export type AuthErrorMessageProps = {
  reason: AuthErrorReason
  loginHref: string
}

/**
 * 理由ごとの文言。failed と too_many_attempts は、ID ブローカーのログインの失敗の画面と同じ定数を使う（ADR-0003）。
 * denied は、登録されていないメールと有効でない職員を分けず、登録の有無と職員の状態を明かさない。
 */
const messages: Record<AuthErrorReason, AuthMessage> = {
  failed: loginFailedMessage,
  denied: {
    title: 'ログインできませんでした',
    body: '入れたメールアドレスでは、ログインできません。事業所の管理者に、登録のメールアドレスを確認してください。',
  },
  account_mismatch: {
    title: '登録と違うアカウントでログインしました',
    body: '登録したメールアドレスのアカウントで、もう一度ログインしてください。分からないときは、事業所の管理者に確認してください。',
  },
  interrupted: {
    title: 'ログインを続けられませんでした',
    body: 'もう一度ログインしてください。',
  },
  forbidden: {
    title: 'この事業所に登録されていません',
    body: '事業所の管理者に、メールアドレスの登録を頼んでください。',
  },
  too_many_attempts: tooManyAttemptsMessage,
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
