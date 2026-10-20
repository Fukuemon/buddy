import { Button } from '@buddy/ui'

export type ViewerMenuProps = {
  staffName: string
  /** false なら、ログアウトのボタンを出さない。偽物の API で動くときはセッションが無い。 */
  canLogout: boolean
}

/** ヘッダーの右端の、ログインした職員の名前とログアウト。幅 768px 未満では、名前を出さない。 */
export const ViewerMenu = ({ staffName, canLogout }: ViewerMenuProps) => (
  <div className="flex items-center gap-4" data-testid="viewer-menu">
    <span className="hidden text-body whitespace-nowrap desktop:inline">{staffName}</span>
    {canLogout && (
      <form method="post" action="/auth/logout">
        <Button type="submit" variant="secondary" size="S">
          ログアウト
        </Button>
      </form>
    )}
  </div>
)
