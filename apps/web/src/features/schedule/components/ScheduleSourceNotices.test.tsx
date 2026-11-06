import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import { formatDateTime } from '../lib/dateTime'
import * as stories from './ScheduleSourceNotices.stories'

const { BuddyPrimary, Cutover, Default, GuideOnly } = composeStories(stories)

describe('ScheduleSourceNotices', () => {
  it('同期に失敗したカレンダーと、まだ同期していないカレンダーを、職員と最後に同期できた時刻とともに出す', () => {
    render(<Default />)
    const warning = screen.getByTestId('schedule-calendar-sync-warning')
    expect(warning).toHaveTextContent('予定が最新でない可能性があります')
    expect(
      within(warning).getByTestId('schedule-calendar-sync-warning-calendar-2'),
    ).toHaveTextContent(
      '石川 二葉: 同期に失敗しています（最後に同期できた時刻: 2026年10月20日（火） 09:30）',
    )
    expect(
      within(warning).getByTestId('schedule-calendar-sync-warning-calendar-3'),
    ).toHaveTextContent('上田 三奈: まだ同期していません（最後に同期できた時刻: なし）')
    expect(within(warning).queryByTestId('schedule-calendar-sync-warning-calendar-1')).toBeNull()
  })

  it('確認が必要な予定を、日時、職員、理由で並べ、押すと予定を開く', async () => {
    const onOpenSchedule = fn()
    render(<Default onOpenSchedule={onOpenSchedule} />)
    const notice = screen.getByTestId('schedule-calendar-needs-review')
    expect(notice).toHaveTextContent('確認が必要な予定が 3 件あります')
    expect(notice).toHaveTextContent(
      'Google カレンダーでタイトルか繰り返しの規則を直してください。',
    )
    const item = within(notice).getByTestId('schedule-calendar-needs-review-gcal-review-1')
    expect(item).toHaveTextContent(
      '2026年10月20日（火） 15:00〜15:29 石川 二葉: タイトルの利用者が見つかりません',
    )
    await userEvent.click(item)
    expect(onOpenSchedule).toHaveBeenCalledWith('gcal-review-1')
  })

  it('同期が新しく確認が必要な予定も無ければ、案内だけを出す', () => {
    render(<GuideOnly />)
    expect(screen.getByTestId('schedule-calendar-google-primary')).toHaveTextContent(
      'Google カレンダーと buddy のどちらでも作成、変更できます',
    )
    expect(screen.queryByTestId('schedule-calendar-sync-warning')).toBeNull()
    expect(screen.queryByTestId('schedule-calendar-needs-review')).toBeNull()
  })

  it('buddy_primary の事業所では何も出さない', () => {
    const { container } = render(<BuddyPrimary />)
    expect(container).toBeEmptyDOMElement()
  })

  it('予定の正本を buddy に切り替えている間は、切り替え中であることと、予定を変えられないことを伝える文と、始めた職員と時刻を出す', () => {
    render(<Cutover />)
    const notice = screen.getByTestId('schedule-calendar-cutover')
    expect(notice).toHaveTextContent('予定の正本を buddy に切り替えています')
    expect(notice).toHaveTextContent('Google カレンダーで予定を作成、変更しないでください')
    expect(notice).toHaveTextContent('buddy でも予定を作成、変更できません')
    expect(within(notice).getByTestId('schedule-calendar-cutover-started')).toHaveTextContent(
      `開始: 佐藤 一郎、${formatDateTime(new Date('2026-10-05T00:00:00Z'))}`,
    )
  })

  it('切り替えていないときは、切り替え中を出さない', () => {
    render(<GuideOnly />)
    expect(screen.queryByTestId('schedule-calendar-cutover')).toBeNull()
  })
})
