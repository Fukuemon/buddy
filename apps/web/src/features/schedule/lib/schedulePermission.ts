import type { SchedulePolicy, Staff, Viewer } from '#/api/types'

/** 予定の権限を判定する職員。チームは、職員の今のチームである。 */
type ScheduleOwner = Pick<Staff, 'id' | 'teamId'>

/** 判定に使う、ログインした職員の値。 */
type ScheduleViewer = Pick<Viewer, 'staffId' | 'schedulePolicies'>

const allows = (
  policy: SchedulePolicy,
  viewer: ScheduleViewer,
  owner: ScheduleOwner,
  edit: boolean,
) => {
  switch (policy.code) {
    case 'schedule.self.edit':
      return owner.id === viewer.staffId
    case 'schedule.all.edit':
      return true
    case 'schedule.all.read':
      return !edit
    case 'schedule.user.edit':
      return policy.targetStaffIds.includes(owner.id)
    case 'schedule.user.read':
      return !edit && policy.targetStaffIds.includes(owner.id)
    case 'schedule.team.edit':
      return policy.targetTeamIds.includes(owner.teamId)
    case 'schedule.team.read':
      return !edit && policy.targetTeamIds.includes(owner.teamId)
  }
}

/**
 * ログインした職員が、owner の予定を作り、変えてよいか。予定の API の判定（schedule.CanEdit）と同じ規則で決める。
 * 画面の出し分けだけに使い、拒むのは予定の API である。
 */
export const canEditScheduleOf = (viewer: ScheduleViewer, owner: ScheduleOwner) =>
  viewer.schedulePolicies.some((policy) => allows(policy, viewer, owner, true))

/** ログインした職員が、owner の予定を見てよいか。自分の予定は権限によらず見てよい（schedule.CanRead と同じ）。 */
export const canReadScheduleOf = (viewer: ScheduleViewer, owner: ScheduleOwner) =>
  owner.id === viewer.staffId ||
  viewer.schedulePolicies.some((policy) => allows(policy, viewer, owner, false))

/** staffList のうち、ログインした職員が予定を作り、変えてよい職員だけを返す。 */
export const editableStaff = <T extends ScheduleOwner>(
  viewer: ScheduleViewer,
  staffList: readonly T[],
) => staffList.filter((staff) => canEditScheduleOf(viewer, staff))

/** staffList のうち、ログインした職員が予定を見てよい職員だけを返す。 */
export const readableStaff = <T extends ScheduleOwner>(
  viewer: ScheduleViewer,
  staffList: readonly T[],
) => staffList.filter((staff) => canReadScheduleOf(viewer, staff))

/** ログインした職員が、誰かの予定を作れるか。予定の作成のボタンを出すかに使う。 */
export const canEditAnySchedule = (viewer: ScheduleViewer) =>
  viewer.schedulePolicies.some((policy) => policy.code.endsWith('.edit'))

/**
 * URL の staffIds から、ログインした職員が予定を見てよくない職員を除く。
 * 見えない職員が選んだままになると、絞り込みの「全員」と「一部」の判定が崩れるためである。職員の一覧を取り終える前は、そのまま返す。
 */
export const readableStaffIds = (
  viewer: ScheduleViewer,
  staffIds: Staff['id'][],
  staffList: readonly ScheduleOwner[] | undefined,
) => {
  if (staffList === undefined) return staffIds
  return staffIds.filter((id) => {
    const owner = staffList.find((staff) => staff.id === id)
    return owner !== undefined && canReadScheduleOf(viewer, owner)
  })
}
