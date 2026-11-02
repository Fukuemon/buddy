import { ApiError } from '#/api/BuddyApi'

/** 部署かチームを読めなかったときの文。 */
export const LOAD_ERROR_MESSAGE =
  '部署とチームを読み込めませんでした。時間をおいて、読み直してください。'

/** 名前を入れずに作るか保存を押したときの文。 */
export const NAME_REQUIRED_MESSAGE = '名前を入れてください'

/** 部署かチーム。文の「部署」「チーム」に入る。 */
export type UnitKind = 'department' | 'team'

const UNIT_LABELS: Record<UnitKind, string> = { department: '部署', team: 'チーム' }

/**
 * 部署かチームを作れなかったか、変えられなかったときの文。name は送った名前である。
 * 409 は同じ名前の部署かチームがあるとき、404 は編集している部署かチームがほかの職員の操作で無くなったときである。
 */
export const submitErrorMessage = (error: unknown, kind: UnitKind, name: string) => {
  const label = UNIT_LABELS[kind]
  if (error instanceof ApiError) {
    if (error.status === 409)
      return `「${name}」という名前の${label}は、すでにあります。別の名前にしてください。`
    if (error.status === 404)
      return `この${label}が見つかりません。閉じてから、開き直してください。`
    if (error.status === 403) return 'この操作をする権限がありません。'
  }
  return '保存できませんでした。時間をおいて、もう一度保存してください。'
}
