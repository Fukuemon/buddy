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

/** チームの色の値ごとの、点のクラス名。Tailwind が読めるように、名前を全て書く。 */
const TEAM_DOT_CLASS_NAMES: Record<TeamColor, string> = {
  blue: 'bg-team-blue',
  orange: 'bg-team-orange',
  magenta: 'bg-team-magenta',
  cyan: 'bg-team-cyan',
  yellow: 'bg-team-yellow',
  purple: 'bg-team-purple',
  green: 'bg-team-green',
  lime: 'bg-team-lime',
}

/** チームの色の点のクラス名。DotLabel の dotClassName に渡す。 */
export const teamColorDotClassName = (color: TeamColor) => TEAM_DOT_CLASS_NAMES[color]

/** チームの点のクラス名。チームを読み終えていないか見つからなければ undefined を返し、色の付かない点にする。 */
export const teamDotClassName = (teams: readonly Team[], teamId: Team['id']) => {
  const team = teams.find((t) => t.id === teamId)
  return team === undefined ? undefined : TEAM_DOT_CLASS_NAMES[team.color]
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
