import { TEAM_COLORS, type Team, type TeamColor } from '#/api/types'

/** チームの色の選択肢に出す色の名前。 */
export const TEAM_COLOR_LABELS: Record<TeamColor, string> = {
  blue: '青',
  orange: 'オレンジ',
  magenta: '赤紫',
  cyan: '青緑',
  yellow: '黄',
  purple: '紫',
  green: '緑',
  lime: '黄緑',
}

/**
 * チームを作るときに最初に選ぶ色を返す。事業所のチームが使っている数が最も少ない色で、同じ数なら TEAM_COLORS の先の色にする。
 * 予定の API が、色を省いたチームに選ぶ色と同じ規則である。
 */
export const nextTeamColor = (teams: readonly Pick<Team, 'color'>[]): TeamColor => {
  const counts = new Map<TeamColor, number>()
  for (const team of teams) counts.set(team.color, (counts.get(team.color) ?? 0) + 1)
  return TEAM_COLORS.reduce((next, color) =>
    (counts.get(color) ?? 0) < (counts.get(next) ?? 0) ? color : next,
  )
}
