import { Button } from '@buddy/ui'
import { useId } from 'react'

export type ViewerMenuProps = {
  staffName: string
  /** false なら、ログアウトのボタンを出さない。フェイクの API で動くときはセッションが無い。 */
  canLogout: boolean
}

/**
 * ヘッダーの右端の、ログインした職員のアカウントのボタン。名前の先頭の 1 文字を入れた丸と、名前を並べる。幅 768px 未満では丸だけにする。
 * 押すと、名前、自分の情報の画面へのリンク、ログアウトを入れたメニューをボタンの下に開く。メニューはブラウザの popover で、外を押すか Esc で閉じる。
 */
export const ViewerMenu = ({ staffName, canLogout }: ViewerMenuProps) => {
  const menuId = useId()
  return (
    <div data-testid="viewer-menu">
      <button
        aria-label={`アカウント（${staffName}）`}
        className="flex h-11 items-center gap-2 rounded-full p-1 hover:bg-surface-subtle focus-visible:focus-ring desktop:pr-3"
        data-testid="viewer-menu-open"
        popoverTarget={menuId}
        type="button"
      >
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-primary text-label text-text-inverse"
        >
          {staffName.charAt(0)}
        </span>
        <span aria-hidden="true" className="hidden text-body whitespace-nowrap desktop:inline">
          {staffName}
        </span>
      </button>
      {/* popover は最上層に出て既定で画面の中央に置かれるので、ヘッダーの右端の下へ置き直す */}
      <div
        className="fixed inset-auto top-14 right-2 m-0 min-w-52 flex-col items-start gap-4 rounded-8 bg-surface p-4 shadow-3 open:flex"
        id={menuId}
        popover="auto"
      >
        <span className="text-body whitespace-nowrap">{staffName}</span>
        <a
          className="inline-flex min-h-11 items-center text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
          data-testid="viewer-profile"
          href="/me"
        >
          自分の情報
        </a>
        {canLogout && (
          <form method="post" action="/auth/logout">
            <Button type="submit" variant="secondary" size="S" data-testid="viewer-logout">
              ログアウト
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
