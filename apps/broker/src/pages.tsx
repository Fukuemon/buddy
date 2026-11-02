import { Button, FormField, formFieldControlClassName } from '@buddy/ui'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AuthCard } from './AuthCard'
import { loginFailedMessage, logoutFailedMessage, type AuthMessage } from './messages'

/**
 * ID ブローカーが Go の html/template で埋める式。React は `{`、`}`、`.` をエスケープしないので、式はそのまま書き出される。
 * css は生成した CSS を、challenge は Hydra の login_challenge を埋める。
 */
const templateExpression = {
  css: '{{css}}',
  challenge: '{{.Challenge}}',
} as const

const Document = ({ children }: { children: ReactNode }) => (
  <html lang="ja">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>buddy にログイン</title>
      <style dangerouslySetInnerHTML={{ __html: templateExpression.css }} />
    </head>
    <body>
      <main className="grid min-h-dvh place-items-center p-4">{children}</main>
    </body>
  </html>
)

const LoginPage = () => (
  <Document>
    <AuthCard title="buddy にログイン">
      <form method="post" action="/login" className="mt-8">
        <input type="hidden" name="login_challenge" defaultValue={templateExpression.challenge} />
        <FormField
          label="メールアドレス"
          hint="事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。"
        >
          {(props) => (
            <input
              {...props}
              type="email"
              name="email"
              required
              autoComplete="email"
              // 画面の操作はメールを入れることだけで、web のログインのボタンから来た職員がすぐ入れられるようにする
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className={formFieldControlClassName}
            />
          )}
        </FormField>
        <Button type="submit" isWide className="mt-8">
          次へ
        </Button>
      </form>
    </AuthCard>
  </Document>
)

const MessagePage = ({ message }: { message: AuthMessage }) => (
  <Document>
    <AuthCard title={message.title}>
      <p className="text-center">{message.body}</p>
    </AuthCard>
  </Document>
)

const generatedNote =
  '<!-- 生成物。手で直さない。apps/broker の pnpm generate が src/pages.tsx から作る。 -->\n'

/**
 * ID ブローカーの画面を、Go の html/template のテンプレートとして書き出す。キーはファイルの名前で、ID ブローカーはこの名前で画面を引く。
 */
export const renderPages = (): Record<string, string> => {
  const render = (page: ReactNode) =>
    `<!doctype html>\n${generatedNote}${renderToStaticMarkup(page)}\n`
  return {
    'login.html': render(<LoginPage />),
    'failure.html': render(<MessagePage message={loginFailedMessage} />),
    'logout-failure.html': render(<MessagePage message={logoutFailedMessage} />),
  }
}
