import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { otherPositionOption } from '../../selectors/staffPosition'

/** story を開き、ready の要素が出るまで待つ。 */
const openStory = async (page: Page, id: string, ready: Locator) => {
  await page.goto(storyUrl(id))
  await expect(ready).toBeVisible()
}

const RECEIPT = '画面-receipt-receiptcheckformcontainer--default'
const CALENDAR_LINK = '画面-calendar-calendarlinkcontainer--default'
const CALENDAR_IMPORT = '画面-calendar-calendarimportcontainer--initial'
const STAFF_DETAIL = '画面-staff-staffdetailcontainer--default'

test.describe('押せないボタンの条件の文', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test('submit-hint-receipt 照合の画面で入力がそろっていない場合、「照合する」の横に押せるようにする条件が出ること', async ({
      page,
    }) => {
      const submit = page.getByTestId('receipt-check-submit')
      await openStory(page, RECEIPT, submit)
      await intro(
        page,
        '照合の画面で入力がそろっていないとき、「照合する」の横に押せるようにする条件が出る\n前提 照合の画面（Storybook の ReceiptCheckFormContainer）を、実績の CSV を選ばずに開いている',
      )

      await check(
        page,
        '「照合する」は押せず、横に「対象の月と実績の CSV を選んでください。」が出て、ボタンの説明になる',
        async () => {
          await expect(submit).toHaveAttribute('aria-disabled', 'true')
          await expect(submit).toHaveAccessibleDescription(
            '対象の月と実績の CSV を選んでください。',
          )
        },
      )
    })

    test('submit-hint-calendar-link カレンダーの結び付けでカレンダーの ID が空の場合、確認のボタンと結び付けるのボタンの近くに条件が出ること', async ({
      page,
    }) => {
      const open = page.getByTestId('calendar-link-open-staff-3')
      await openStory(page, CALENDAR_LINK, open)
      await intro(
        page,
        'カレンダーの結び付けでカレンダーの ID が空のとき、「読めるか確認する」と「結び付ける」の近くに押せるようにする条件が出る\n前提 カレンダーの連携の画面（Storybook の CalendarLinkContainer）を開いている',
      )

      const dialog = page.getByTestId('calendar-link-dialog')
      await step(
        page,
        'カレンダーの無い職員の「結び付ける」を押し、カレンダーの ID の欄を空にする',
        async () => {
          await open.click()
          await dialog.getByTestId('calendar-link-input').clear()
        },
      )
      await check(
        page,
        '「読めるか確認する」の横に ID を入れる条件が、フッターの「結び付ける」の上に読めることを確認する条件が出る',
        async () => {
          await expect(dialog.getByTestId('calendar-link-check')).toHaveAccessibleDescription(
            'カレンダーの ID を入れると確認できます。',
          )
          await expect(dialog.getByTestId('calendar-link-submit')).toHaveAccessibleDescription(
            '「読めるか確認する」で読めることを確認すると、結び付けられます。',
          )
        },
      )
    })

    test('submit-hint-calendar-import カレンダーの取り込みで開始日を空にした場合、「プレビューする」の横に条件が出ること', async ({
      page,
    }) => {
      const start = page.getByTestId('calendar-import-start')
      await openStory(page, CALENDAR_IMPORT, start)
      await intro(
        page,
        'カレンダーの取り込みで開始日を空にすると、「プレビューする」の横に押せるようにする条件が出る\n前提 カレンダーの取り込みの画面（Storybook の CalendarImportContainer）を開いている',
      )

      await step(page, '開始日の欄を空にする', () => start.fill(''))
      await check(
        page,
        '「プレビューする」は押せず、横に「開始日と終了日を入れると、プレビューできます。」が出る',
        async () => {
          const preview = page.getByTestId('calendar-import-preview')
          await expect(preview).toHaveAttribute('aria-disabled', 'true')
          await expect(preview).toHaveAccessibleDescription(
            '開始日と終了日を入れると、プレビューできます。',
          )
        },
      )
    })

    test('submit-hint-staff-position 職員の役職を変えるで今の役職のままの場合、「変える」の上に条件が出ること', async ({
      page,
    }) => {
      await openStory(page, STAFF_DETAIL, page.getByTestId('staff-detail-name'))
      await intro(
        page,
        '職員の役職を変えるで今の役職のままのとき、確定のボタンの上に押せるようにする条件が出る\n前提 職員の詳細（Storybook の StaffDetailContainer）を開いている',
      )

      const dialog = page.getByTestId('staff-position-dialog')
      const submit = dialog.getByTestId('staff-position-submit')
      await step(page, '役職の「変える」を押す', () =>
        page.getByTestId('staff-detail-position-change').click(),
      )
      await check(
        page,
        '確定のボタンは押せず、上に「今の役職と違う役職を選んでください。」が出る',
        () => expect(submit).toHaveAccessibleDescription('今の役職と違う役職を選んでください。'),
      )

      await step(page, '今と違う役職を選ぶ', () => otherPositionOption(dialog).check())
      await check(page, '確定のボタンが押せるようになり、条件の文が消える', () =>
        expect(submit).toHaveAccessibleDescription(''),
      )
    })

    test('submit-hint-staff-policies 職員の権限を変えるで何も変えていない場合、「保存」の上に条件が出ること', async ({
      page,
    }) => {
      await openStory(page, STAFF_DETAIL, page.getByTestId('staff-detail-name'))
      await intro(
        page,
        '職員の権限を変えるで何も変えていないとき、「保存」の上に押せるようにする条件が出る\n前提 職員の詳細（Storybook の StaffDetailContainer）を開いている',
      )

      const submit = page.getByTestId('staff-policies-dialog').getByTestId('staff-policies-submit')
      await step(page, '権限のタブを開き、「権限を変える」を押す', async () => {
        await page.getByTestId('staff-detail-tab-policies').click()
        await page.getByTestId('staff-detail-policies-change').click()
        await submit.scrollIntoViewIfNeeded()
      })
      await check(
        page,
        '「保存」は押せず、上に「付ける権限か外す権限を選んでください。」が出る',
        () => expect(submit).toHaveAccessibleDescription('付ける権限か外す権限を選んでください。'),
      )
    })
  })
})
