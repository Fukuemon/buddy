import type { ReactNode } from 'react'

export type AuthCardProps = {
  title: string
  children: ReactNode
  testId?: string
}

/**
 * ログインと、ログインとログアウトの失敗の画面のカード。画面の中央に置き、上端にロゴ、その下に見出しを出す。
 * ID ブローカーの画面と、web のログインの失敗の画面が使う。
 */
export const AuthCard = ({ title, children, testId }: AuthCardProps) => (
  <section
    className="w-full max-w-lg rounded-8 bg-surface px-6 py-10 ring-1 ring-border desktop:px-18 desktop:py-14"
    data-testid={testId}
  >
    <p aria-hidden className="text-center text-heading-md text-primary">
      buddy
    </p>
    <h1 className="mt-2 mb-4 text-center text-heading-sm">{title}</h1>
    {children}
  </section>
)
