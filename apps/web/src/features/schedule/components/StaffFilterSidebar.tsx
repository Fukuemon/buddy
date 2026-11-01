import { SearchBox } from '@buddy/ui'
import { useState } from 'react'

import type { Staff, Team } from '#/api/types'
import { DotLabel } from '#/components/site/StatusBadge'
import { teamColorDotClassName } from '#/components/site/teamDot'

import { staffColorMap } from '../lib/toCalendarEvents'

export type StaffFilterSidebarProps = {
  teams: Team[]
  staffList: Staff[]
  /** 空のときは全員を表示している状態として扱う。 */
  selectedStaffIds: Staff['id'][]
  onChange: (staffIds: Staff['id'][]) => void
  /** ログインした職員。一覧にいるときだけ、自分だけを出すボタンを出す。 */
  viewerStaffId?: Staff['id']
}

/** 名前の照合のために、全角と半角をそろえ、空白を除く。「青木一郎」でも「青木 一郎」に当てる。 */
const normalizeName = (name: string) => name.normalize('NFKC').replace(/\s/g, '')

/**
 * 予定を出す職員を、チームと職員のチェックボックスで絞り込む。
 * 職員のチェックボックスは、カレンダーの予定と同じ職員の色で出し、凡例を兼ねる。チームの見出しには、チームの色の点を名前の前に置く。
 * 名前の検索は一覧の表示だけを絞り、チェックの状態は変えない。
 * チームのチェックボックスは、検索で隠れた職員も含めて印を決め、まとめて外す、付ける。
 */
export const StaffFilterSidebar = ({
  teams,
  staffList,
  selectedStaffIds,
  onChange,
  viewerStaffId,
}: StaffFilterSidebarProps) => {
  const [query, setQuery] = useState('')
  const keyword = normalizeName(query)
  const matches = (staff: Staff) => normalizeName(staff.name).includes(keyword)
  const colorOf = staffColorMap(staffList)
  const canShowOnlyViewer =
    viewerStaffId !== undefined && staffList.some((staff) => staff.id === viewerStaffId)
  const isAll = selectedStaffIds.length === 0
  const isOnlyViewer =
    (selectedStaffIds.length === 1 && selectedStaffIds[0] === viewerStaffId) ||
    (isAll && staffList.length === 1)
  const teamRows = teams
    .map((team) => {
      const members = staffList.filter((staff) => staff.teamId === team.id)
      return { team, members, shownMembers: members.filter(matches) }
    })
    .filter(({ shownMembers }) => keyword === '' || shownMembers.length > 0)
  const isSelected = (staffId: Staff['id']) => isAll || selectedStaffIds.includes(staffId)
  const current = isAll ? staffList.map((staff) => staff.id) : selectedStaffIds

  const commit = (ids: Staff['id'][]) => {
    // 空の配列は全員の表示を意味するため、最後の 1 人を外す操作は受け付けない。
    if (ids.length === 0) return
    onChange(ids.length === staffList.length ? [] : ids)
  }

  const toggleStaff = (staffId: Staff['id'], checked: boolean) =>
    commit(checked ? [...current, staffId] : current.filter((id) => id !== staffId))

  const toggleTeam = (team: Team, checked: boolean) => {
    const memberIds = staffList.filter((staff) => staff.teamId === team.id).map((staff) => staff.id)
    const next = checked
      ? [...new Set([...current, ...memberIds])]
      : current.filter((id) => !memberIds.includes(id))
    commit(next)
  }

  return (
    <nav
      aria-label="職員の絞り込み"
      className="flex flex-col gap-5 p-5"
      data-testid="staff-filter-sidebar"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-caption font-bold text-text-secondary">職員</h2>
        <div className="flex">
          {canShowOnlyViewer && (
            <button
              className="min-h-11 px-2 text-caption text-primary underline disabled:text-text-disabled disabled:no-underline"
              data-testid="staff-filter-only-me"
              disabled={isOnlyViewer}
              onClick={() => commit([viewerStaffId])}
              type="button"
            >
              自分だけ
            </button>
          )}
          <button
            className="min-h-11 px-2 text-caption text-primary underline disabled:text-text-disabled disabled:no-underline"
            data-testid="staff-filter-reset"
            disabled={isAll}
            onClick={() => onChange([])}
            type="button"
          >
            全員を表示
          </button>
        </div>
      </div>
      <SearchBox
        aria-label="職員の名前で絞り込む"
        data-testid="staff-filter-search"
        onSearch={setQuery}
        placeholder="名前で絞り込む"
      />
      {/* 語を入れた結果を読み上げるよう、ライブリージョンは常に置き、文だけを出し入れする */}
      <output className="block text-caption text-text-secondary empty:hidden">
        {keyword !== '' &&
          teamRows.length === 0 &&
          `名前に「${query.trim()}」を含む職員はいません。`}
      </output>
      {teamRows.map(({ team, members, shownMembers }) => {
        const checkedCount = members.filter((staff) => isSelected(staff.id)).length
        return (
          <fieldset className="flex flex-col" key={team.id}>
            <label className="flex min-h-11 items-center gap-2 font-bold">
              <input
                checked={members.length > 0 && checkedCount === members.length}
                data-testid={`staff-filter-team-${team.id}`}
                onChange={(event) => toggleTeam(team, event.target.checked)}
                ref={(element) => {
                  if (element !== null) {
                    element.indeterminate = checkedCount > 0 && checkedCount < members.length
                  }
                }}
                type="checkbox"
              />
              <DotLabel dotClassName={teamColorDotClassName(team.color)}>{team.name}</DotLabel>
            </label>
            {shownMembers.map((staff) => (
              <label
                className="flex min-h-11 items-center gap-2 pl-6 text-body-dense"
                key={staff.id}
              >
                <input
                  checked={isSelected(staff.id)}
                  data-testid={`staff-filter-staff-${staff.id}`}
                  onChange={(event) => toggleStaff(staff.id, event.target.checked)}
                  style={{ accentColor: colorOf.get(staff.id) }}
                  type="checkbox"
                />
                {staff.name}
              </label>
            ))}
          </fieldset>
        )
      })}
    </nav>
  )
}
