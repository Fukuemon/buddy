import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { otherPositionOption } from '../../selectors/staffPosition'

const ACTOR = 'ログインなし（Storybook の story）'

/** story を開き、ready の testid の要素が出るまで待つ。 */
const openStory = (id: string, ready: string) => async (page: Page) => {
  await page.goto(storyUrl(id))
  await expect(page.getByTestId(ready)).toBeVisible()
}

const RECEIPT = '画面-receipt-receiptcheckformcontainer--default'
const CALENDAR_LINK = '画面-calendar-calendarlinkcontainer--default'
const CALENDAR_IMPORT = '画面-calendar-calendarimportcontainer--initial'
const STAFF_DETAIL = '画面-staff-staffdetailcontainer--default'

test.describe('押せないボタンの条件の文', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}照合の画面で入力がそろっていない場合、「照合する」の横に押せるようにする条件が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'submit-hint-receipt',
          title:
            '照合の画面で入力がそろっていないとき、「照合する」の横に押せるようにする条件が出る',
          actor: ACTOR,
          variant,
        },
        openStory(RECEIPT, 'receipt-check-submit'),
        async ({ page, step, check }) => {
          await openStory(RECEIPT, 'receipt-check-submit')(page)
          await step(
            '照合の画面（Storybook の ReceiptCheckFormContainer）を、実績の CSV を選ばずに開いている',
          )
          const submit = page.getByTestId('receipt-check-submit')
          await expect(submit).toHaveAttribute('aria-disabled', 'true')
          await expect(page.getByTestId('receipt-check-submit-hint')).toHaveText(
            '対象の月と実績の CSV を選んでください。',
          )
          await expect(submit).toHaveAccessibleDescription(
            '対象の月と実績の CSV を選んでください。',
          )
          await check(
            '「照合する」は押せず、横に「対象の月と実績の CSV を選んでください。」が出て、ボタンの説明になる',
          )
        },
      )
    })

    test(`${prefix}カレンダーの結び付けでカレンダーの ID が空の場合、確認のボタンと結び付けるのボタンの近くに条件が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'submit-hint-calendar-link',
          title:
            'カレンダーの結び付けでカレンダーの ID が空のとき、「読めるか確認する」と「結び付ける」の近くに押せるようにする条件が出る',
          actor: ACTOR,
          variant,
        },
        openStory(CALENDAR_LINK, 'calendar-link-open-staff-3'),
        async ({ page, step, check }) => {
          await openStory(CALENDAR_LINK, 'calendar-link-open-staff-3')(page)
          await step('カレンダーの連携の画面（Storybook の CalendarLinkContainer）を開いている')

          await step('カレンダーの無い職員の「結び付ける」を押し、カレンダーの ID の欄を空にする')
          await page.getByTestId('calendar-link-open-staff-3').click()
          const dialog = page.getByTestId('calendar-link-dialog')
          await dialog.getByTestId('calendar-link-input').clear()
          await expect(dialog.getByTestId('calendar-link-check')).toHaveAccessibleDescription(
            'カレンダーの ID を入れると確認できます。',
          )
          await expect(dialog.getByTestId('calendar-link-submit')).toHaveAccessibleDescription(
            '「読めるか確認する」で読めることを確認すると、結び付けられます。',
          )
          await check(
            '「読めるか確認する」の横に ID を入れる条件が、フッターの「結び付ける」の左に読めることを確認する条件が出る',
          )
        },
      )
    })

    test(`${prefix}カレンダーの取り込みで開始日を空にした場合、「プレビューする」の横に条件が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'submit-hint-calendar-import',
          title:
            'カレンダーの取り込みで開始日を空にすると、「プレビューする」の横に押せるようにする条件が出る',
          actor: ACTOR,
          variant,
        },
        openStory(CALENDAR_IMPORT, 'calendar-import-start'),
        async ({ page, step, check }) => {
          await openStory(CALENDAR_IMPORT, 'calendar-import-start')(page)
          await step(
            'カレンダーの取り込みの画面（Storybook の CalendarImportContainer）を開いている',
          )

          await step('開始日の欄を空にする')
          await page.getByTestId('calendar-import-start').fill('')
          const preview = page.getByTestId('calendar-import-preview')
          await expect(preview).toHaveAttribute('aria-disabled', 'true')
          await expect(page.getByTestId('calendar-import-preview-hint')).toHaveText(
            '開始日と終了日を入れると、プレビューできます。',
          )
          await check(
            '「プレビューする」は押せず、横に「開始日と終了日を入れると、プレビューできます。」が出る',
          )
        },
      )
    })

    test(`${prefix}職員の役職を変えるで今の役職のままの場合、「変える」の左に条件が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'submit-hint-staff-position',
          title:
            '職員の役職を変えるで今の役職のままのとき、確定のボタンの左に押せるようにする条件が出る',
          actor: ACTOR,
          variant,
        },
        openStory(STAFF_DETAIL, 'staff-detail-name'),
        async ({ page, step, check }) => {
          await openStory(STAFF_DETAIL, 'staff-detail-name')(page)
          await step('職員の詳細（Storybook の StaffDetailContainer）を開いている')

          await step('役職の「変える」を押す')
          await page.getByTestId('staff-detail-position-change').click()
          const dialog = page.getByTestId('staff-position-dialog')
          await expect(dialog.getByTestId('staff-position-submit-hint')).toHaveText(
            '今の役職と違う役職を選んでください。',
          )
          await check('確定のボタンは押せず、左に「今の役職と違う役職を選んでください。」が出る')

          await step('今と違う役職を選ぶ')
          await otherPositionOption(dialog).check()
          await expect(dialog.getByTestId('staff-position-submit-hint')).toBeHidden()
          await check('確定のボタンが押せるようになり、条件の文が消える')
        },
      )
    })

    test(`${prefix}職員の権限を変えるで何も変えていない場合、「保存」の左に条件が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'submit-hint-staff-policies',
          title:
            '職員の権限を変えるで何も変えていないとき、「保存」の左に押せるようにする条件が出る',
          actor: ACTOR,
          variant,
        },
        openStory(STAFF_DETAIL, 'staff-detail-name'),
        async ({ page, step, check }) => {
          await openStory(STAFF_DETAIL, 'staff-detail-name')(page)
          await step('職員の詳細（Storybook の StaffDetailContainer）を開いている')

          await step('権限のタブを開き、「権限を変える」を押す')
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await expect(dialog.getByTestId('staff-policies-submit-hint')).toHaveText(
            '付ける権限か外す権限を選んでください。',
          )
          await check('「保存」は押せず、左に「付ける権限か外す権限を選んでください。」が出る')
        },
      )
    })
  }
})
