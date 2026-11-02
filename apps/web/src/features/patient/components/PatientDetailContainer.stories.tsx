import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError, type BuddyApi } from '#/api/client'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_FACILITY_ID, FAKE_VIEWER } from '#/api/fake/fixtures'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { PatientDetailContainer } from './PatientDetailContainer'

const route = (patientId: string, appRouter: Partial<AppRouterParameters> = {}) => ({
  appRouter: { route: '/patients_/$patientId', url: `/patients/${patientId}`, ...appRouter },
})

/** 利用の終了の近藤 晴美（patient-ended）の担当を石川 二葉（staff-2）にし、石川 二葉を休職にしたフェイクの API を作る。 */
export const endedWithStoppedStaffApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  void base.patients
    .update(FAKE_FACILITY_ID, 'patient-ended', {
      name: '近藤 晴美',
      preferred_time: '午前',
      preferred_gender: '女性',
      service_code_id: 'code-i2',
      assigned_staff_id: 'staff-2',
    })
    .then(() => base.staff.startLeave(FAKE_FACILITY_ID, 'staff-2', null))
  return base
}

const meta = {
  title: '画面/Patient/PatientDetailContainer',
  component: PatientDetailContainer,
  decorators: [withAppRouter],
  args: { patientId: 'patient-4' },
  parameters: route('patient-4'),
} satisfies Meta<typeof PatientDetailContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 利用中の利用者。状態の印と利用の状態を出さない。今日以降の予定は残っていない。 */
export const Default: Story = {}

/** サービスコードを 1 回目だけ読めないフェイクの API を作る。 */
const serviceCodesOnceFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  let failed = false
  return {
    ...base,
    serviceCodes: {
      list: async (facilityId) => {
        if (!failed) {
          failed = true
          throw new ApiError(500, '読めない')
        }
        return base.serviceCodes.list(facilityId)
      },
    },
  }
}

/** 職員を読めないフェイクの API を作る。 */
const staffFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: {
      ...base.staff,
      listRecords: async () => {
        throw new ApiError(500, '読めない')
      },
    },
  }
}

/** 幅 768px 未満。編集と「…」を見出しの下に置き、プロフィールの項目の名前と値を縦に積む。 */
export const Mobile: Story = { globals: { viewport: { value: 'mobile1' } } }

/** 今日の予定が残る利用者。利用を終了しようとすると、残る予定を出して拒む。 */
export const WithSchedules: Story = {
  args: { patientId: 'patient-1' },
  parameters: route('patient-1'),
}

/** 利用の終了の利用者。担当の職員は利用の終了の間に休職になった。 */
export const Ended: Story = {
  args: { patientId: 'patient-ended' },
  parameters: route('patient-ended', { api: endedWithStoppedStaffApi() }),
}

/** 職員の一覧で、小林 冬馬（patient-4）の担当の青木 一郎（staff-1）を訪問しない職員として返すフェイクの API を作る。 */
const nonVisitingStaffApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    staff: {
      ...base.staff,
      listRecords: async (facilityId) =>
        (await base.staff.listRecords(facilityId)).map((s) =>
          s.id === 'staff-1' ? { ...s, visits: false } : s,
        ),
    },
  }
}

/** 利用中の利用者。担当の職員は訪問しない職員である。 */
export const NonVisitingStaff: Story = {
  parameters: route('patient-4', { api: nonVisitingStaffApi() }),
}

/** 利用の終了の利用者で、担当の職員の選択肢を読めないとき。再開のダイアログに失敗の文を出す。 */
export const EndedStaffError: Story = {
  args: { patientId: 'patient-ended' },
  parameters: route('patient-ended', { api: staffFailingApi() }),
}

/** サービスコードを 1 回目だけ読めないとき。編集のダイアログを開くと読み直す。 */
export const ServiceCodesOnceError: Story = {
  parameters: route('patient-4', { api: serviceCodesOnceFailingApi() }),
}

export const Loading: Story = { parameters: route('patient-4', { api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route('patient-4', { api: failingBuddyApi() }) }

/** 利用者が見つからないとき。読み直すを出さない。 */
export const NotFound: Story = {
  args: { patientId: 'missing' },
  parameters: route('missing'),
}

/** 職員の管理の権限を持たない職員。API を呼ばずに、権限が無いことだけを示す。 */
export const Forbidden: Story = {
  parameters: route('patient-4', {
    api: failingBuddyApi(),
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
}
