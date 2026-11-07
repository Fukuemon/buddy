import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  failingBuddyApi,
  pendingBuddyApi,
  suspendedStaffBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCreateModalContainer } from './ScheduleCreateModalContainer'
import { selfEditViewer } from './storyData'

/** google_primary の事業所で、最初の作成を 503（google_write_unknown）で返し、2 回目から作るフェイクの API。 */
const writeUnknownOnceApi = (): BuddyApi => {
  const api = createFakeBuddyApi({ sourceMode: 'google_primary' })
  let failed = false
  return {
    ...api,
    schedules: {
      ...api.schedules,
      create: async (...args) => {
        if (!failed) {
          failed = true
          throw new ApiError(
            503,
            '予定を Google カレンダーに書けたかを確認できませんでした',
            [],
            'google_write_unknown',
          )
        }
        return api.schedules.create(...args)
      },
    },
  }
}

/** 久保 秋代（patient-3）のサービスコードを、事業所のサービスコードの一覧に無い「訪看I9」にしたフェイクの API。 */
const unlistedServiceCodeApi = (): BuddyApi => {
  const api = createFakeBuddyApi()
  return {
    ...api,
    patients: {
      ...api.patients,
      list: async (...args) =>
        (await api.patients.list(...args)).map((patient) =>
          patient.id === 'patient-3' ? { ...patient, serviceCode: '訪看I9' } : patient,
        ),
    },
  }
}

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule/new', url: '/schedule/new', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleCreateModalContainer',
  component: ScheduleCreateModalContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof ScheduleCreateModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = { parameters: route({ url: '/schedule/new?kind=normal' }) }

export const FromSlot: Story = {
  parameters: route({ url: '/schedule/new?start=2026-10-21&time=13:00&staffId=staff-2' }),
}

export const ListFailed: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 止めた職員（石川 二葉）がいる事業所。主訪問者の候補に、止めた職員を出さない。 */
export const WithSuspendedStaff: Story = { parameters: route({ api: suspendedStaffBuddyApi() }) }

/** 休職の職員（石川 二葉）の列から開いた URL。主訪問者を未選択で開く。 */
export const FromOnLeaveStaffSlot: Story = {
  parameters: route({
    api: suspendedStaffBuddyApi(),
    url: '/schedule/new?start=2026-10-21&time=13:00&staffId=staff-2',
  }),
}

/** 職員と利用者の一覧を読んでいる間。 */
export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

/** 自分の予定だけを編集できる職員。主訪問者の候補は自分だけになる。 */
export const SelfEditOnly: Story = { parameters: route({ viewer: selfEditViewer }) }

/** Google カレンダーを予定の正本にする事業所。同じフォームを出し、予定の API が Google カレンダーに書く。 */
export const GooglePrimary: Story = {
  parameters: route({ api: createFakeBuddyApi({ sourceMode: 'google_primary' }) }),
}

/** google_primary の事業所で、最初の作成の結果が分からない。もう一度「作成」を押すと、同じ予定の ID で送り直す。 */
export const GooglePrimaryWriteUnknown: Story = {
  parameters: route({
    api: writeUnknownOnceApi(),
    url: '/schedule/new?kind=normal&start=2026-10-21&time=13:00&staffId=staff-2',
  }),
}

/** 木村 夏夫（サービスコードは訪看I3）を選んだ。サービスコードが訪看I3 に、提供時間が訪看I3 の上限の 59 分になる。 */
export const PatientSelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('schedule-field-patient'))
    await userEvent.click(await canvas.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(canvas.getByTestId('schedule-field-date-time'))
  },
}

/**
 * 木村 夏夫を選んだ後に、サービスコードが事業所のサービスコードの一覧に無い久保 秋代に替えた。
 * サービスコードが初期値の訪看I2 に、提供時間が訪看I2 の上限の 29 分になる。
 */
export const PatientServiceCodeUnlisted: Story = {
  parameters: route({ api: unlistedServiceCodeApi() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByTestId('schedule-field-patient'))
    await userEvent.click(await canvas.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(canvas.getByTestId('patient-select-option-patient-3'))
    await userEvent.click(canvas.getByTestId('schedule-field-date-time'))
  },
}
