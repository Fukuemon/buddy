import type { Team, TeamColor } from '#/api/types'

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
