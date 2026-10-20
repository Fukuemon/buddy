import type { Staff, Team } from '#/api/types'

export type StaffFilterSidebarProps = {
  teams: Team[]
  staffList: Staff[]
  /** 空のときは全員を表示している状態として扱う。 */
  selectedStaffIds: Staff['id'][]
  onChange: (staffIds: Staff['id'][]) => void
}

/** 予定を出す職員を、チームと職員のチェックボックスで絞り込む。 */
export const StaffFilterSidebar = ({
  teams,
  staffList,
  selectedStaffIds,
  onChange,
}: StaffFilterSidebarProps) => {
  const isAll = selectedStaffIds.length === 0
  const isSelected = (staffId: Staff['id']) => isAll || selectedStaffIds.includes(staffId)

  const commit = (ids: Staff['id'][]) => {
    // 空の配列は全員の表示を意味するため、最後の 1 人を外す操作は受け付けない。
    if (ids.length === 0) return
    onChange(ids.length === staffList.length ? [] : ids)
  }

  const toggleStaff = (staffId: Staff['id'], checked: boolean) => {
    const current = isAll ? staffList.map((staff) => staff.id) : selectedStaffIds
    commit(checked ? [...current, staffId] : current.filter((id) => id !== staffId))
  }

  const toggleTeam = (team: Team, checked: boolean) => {
    const memberIds = staffList.filter((staff) => staff.teamId === team.id).map((staff) => staff.id)
    const current = isAll ? staffList.map((staff) => staff.id) : selectedStaffIds
    const next = checked
      ? [...new Set([...current, ...memberIds])]
      : current.filter((id) => !memberIds.includes(id))
    commit(next)
  }

  return (
    <nav
      aria-label="職員の絞り込み"
      className="flex flex-col gap-2 p-2 desktop:gap-4 desktop:p-4"
      data-testid="staff-filter-sidebar"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-caption font-bold text-text-secondary">職員</h2>
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
      {teams.map((team) => {
        const members = staffList.filter((staff) => staff.teamId === team.id)
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
              {team.name}
            </label>
            {members.map((staff) => (
              <label
                className="flex min-h-11 items-center gap-2 pl-6 text-body-dense"
                key={staff.id}
              >
                <input
                  checked={isSelected(staff.id)}
                  data-testid={`staff-filter-staff-${staff.id}`}
                  onChange={(event) => toggleStaff(staff.id, event.target.checked)}
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
