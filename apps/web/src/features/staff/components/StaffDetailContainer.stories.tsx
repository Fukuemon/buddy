import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import {
  failOnSecondCall,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { StaffDetailContainer } from './StaffDetailContainer'

const route = (staffId: string, appRouter: Partial<AppRouterParameters> = {}) => ({
  appRouter: { route: '/staff_/$staffId', url: `/staff/${staffId}`, ...appRouter },
})

/** 残る予定と担当の利用者が無いとみなすフェイクの API を作る。 */
export const noAssignmentsApi = (base: BuddyApi = createFakeBuddyApi()): BuddyApi => ({
  ...base,
  staff: {
    ...base.staff,
    remainingAssignments: async () => ({ schedules: [], recurring_schedules: [], patients: [] }),
    retire: async (facilityId, staffId) => ({
      retired: {
        ...(await base.staff.get(facilityId, staffId)),
        status: 'retired',
        email: null,
        phone_number: null,
        retired_at: new Date().toISOString(),
      },
    }),
  },
})

/** 読み込みと送信の間の表示を見るために、フェイクの API の応答を ms ミリ秒遅らせる。 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 江藤 四郎（staff-4）を、戻る予定の日を付けて休職にしたフェイクの API を作る。 */
export const onLeaveApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  void base.staff.startLeave('facility-demo', 'staff-4', '2027-04-01')
  return base
}

/** 江藤 四郎（staff-4）を退職にしたフェイクの API を作る。 */
export const retiredApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: {
      ...base.staff,
      get: async (facilityId, staffId) => ({
        ...(await base.staff.get(facilityId, staffId)),
        status: 'retired',
        email: null,
        phone_number: null,
        retired_at: '2026-09-30T03:00:00Z',
      }),
    },
  }
}

const meta = {
  title: '画面/Staff/StaffDetailContainer',
  component: StaffDetailContainer,
  decorators: [withAppRouter],
  args: { staffId: 'staff-2' },
  parameters: route('staff-2'),
} satisfies Meta<typeof StaffDetailContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 有効な職員のプロフィール。 */
export const Default: Story = {}

/** 幅 768px 未満。編集と「…」を見出しの下に置く。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 休職の職員。「…」のメニューに復職にすると退職にするを入れる。 */
export const OnLeave: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', { api: onLeaveApi() }),
}

/** 退職した職員。編集と「…」と、変える操作を出さない。 */
export const Retired: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', { api: retiredApi() }),
}

/** ログインした職員の自分の詳細。休職と退職ができないので「…」を出さない。 */
export const Self: Story = {
  args: { staffId: FAKE_VIEWER.staffId },
  parameters: route(FAKE_VIEWER.staffId),
}

/** 残る予定と担当の利用者が無い職員。退職にできる。 */
export const NoAssignments: Story = { parameters: route('staff-2', { api: noAssignmentsApi() }) }

export const Loading: Story = { parameters: route('staff-2', { api: pendingBuddyApi() }) }

/** 権限の対象の候補にする職員とチームを、読み終えるまで 8 秒かかる。読んでいる間は、権限を変えるの対象を足すを押せない。 */
export const SlowTargetOptions: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      return {
        ...base,
        staff: {
          ...base.staff,
          list: async (...args) => {
            await wait(8000)
            return base.staff.list(...args)
          },
        },
        teams: {
          ...base.teams,
          list: async (...args) => {
            await wait(8000)
            return base.teams.list(...args)
          },
        },
      }
    })(),
  }),
}

/** 休職の職員の復職に 4 秒かかる。送っている間は、「…」のメニューを開いたまま「復職にしています」を出す。 */
export const SlowReinstate: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', {
    api: ((): BuddyApi => {
      const base = onLeaveApi()
      return {
        ...base,
        staff: {
          ...base.staff,
          reinstate: async (...args) => {
            await wait(4000)
            return base.staff.reinstate(...args)
          },
        },
      }
    })(),
  }),
}

/** 休職の職員を、ほかの職員の操作で退職にしていたので、1 秒後に復職を拒む。 */
export const ReinstateRefused: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', {
    api: ((): BuddyApi => {
      const base = onLeaveApi()
      return {
        ...base,
        staff: {
          ...base.staff,
          reinstate: async () => {
            await wait(1000)
            throw new ApiError(409, '退職した職員は変えられません', [], 'conflict')
          },
        },
      }
    })(),
  }),
}

/** 休職の職員を、ほかの職員の操作で退職にしていたので、4 秒後に復職を拒む。送っている間に、前の失敗の文が消えたことを見られる。 */
export const SlowReinstateRefused: Story = {
  args: { staffId: 'staff-4' },
  parameters: route('staff-4', {
    api: ((): BuddyApi => {
      const base = onLeaveApi()
      return {
        ...base,
        staff: {
          ...base.staff,
          reinstate: async () => {
            await wait(4000)
            throw new ApiError(409, '退職した職員は変えられません', [], 'conflict')
          },
        },
      }
    })(),
  }),
}

/** 全ての権限を、1 回目は読めず、2 回目からは読める。権限のタブに失敗の文と読み直すを出し、読み直すと一覧を出す。 */
export const PoliciesLoadError: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      let calls = 0
      return {
        ...base,
        policies: {
          ...base.policies,
          list: async (...args) => {
            calls += 1
            if (calls === 1) throw new ApiError(500, '権限を読めない')
            return base.policies.list(...args)
          },
        },
      }
    })(),
  }),
}

/** 役職を読めない。権限のタブに失敗の文と読み直すを出し、役職を変えるダイアログに失敗の文を出す。 */
export const PositionsLoadError: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      return {
        ...base,
        positions: {
          ...base.positions,
          list: async () => {
            throw new ApiError(500, '役職を読めない')
          },
        },
      }
    })(),
  }),
}

/** 部署を読めない。プロフィールの編集に失敗の文を出し、保存を押せなくする。 */
export const DepartmentsLoadError: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      return {
        ...base,
        departments: {
          ...base.departments,
          list: async () => {
            throw new ApiError(500, '部署を読めない')
          },
        },
      }
    })(),
  }),
}

/** 部署の選択肢を読み終えるまで 8 秒かかる。読んでいる間は、プロフィールの編集を保存できない。 */
export const SlowDepartments: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      return {
        ...base,
        departments: {
          ...base.departments,
          list: async (...args) => {
            await wait(8000)
            return base.departments.list(...args)
          },
        },
      }
    })(),
  }),
}

/** 役職を読み終えるまで 8 秒かかる。読んでいる間は、役職を変えるときの注意を出さない。 */
export const SlowPositions: Story = {
  parameters: route('staff-2', {
    api: ((): BuddyApi => {
      const base = createFakeBuddyApi()
      return {
        ...base,
        positions: {
          ...base.positions,
          list: async (...args) => {
            await wait(8000)
            return base.positions.list(...args)
          },
        },
      }
    })(),
  }),
}

export const NotFound: Story = {
  args: { staffId: 'missing' },
  parameters: route('missing', {
    api: {
      ...createFakeBuddyApi(),
      staff: {
        ...createFakeBuddyApi().staff,
        get: async () => {
          throw new ApiError(404, '見つかりません', [], 'not_found')
        },
      },
    },
  }),
}

/** 職員を、2 回目だけ読めないフェイクの API を作る。 */
export const refetchFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: { ...base.staff, get: failOnSecondCall((...args) => base.staff.get(...args)) },
  }
}

/** 読み終えた後に読み直して、職員を読めない。詳細を残し、見出しの下に失敗の文と読み直すを出す。 */
export const RefetchError: Story = { parameters: route('staff-2', { api: refetchFailingApi() }) }
