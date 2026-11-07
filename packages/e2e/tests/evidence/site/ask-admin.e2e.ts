import { expect, test, type Locator, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

/** story を開き、描かれたことを示す要素が見えるまで待つ。 */
const openStory = (url: string, shown: (page: Page) => Locator) => async (page: Page) => {
  await page.goto(url)
  await expect(shown(page)).toBeVisible()
}

test.describe('頼む相手の呼び方と、権限を外されたときの文', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}照合で画面を開いた後に照合の権限を外された職員が照合するを押した場合、「この操作をする権限がありません。」が出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-receipt-receiptcheckformcontainer--forbidden-after-revoke')
      const open = openStory(url, (page) => page.getByTestId('receipt-check-form'))
      await recordPrEvidence(
        browser,
        {
          name: 'receipt-check-forbidden-after-revoke',
          title: '照合の権限を外された後に照合すると、規約の文を出す',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, step, check }) => {
          await open(page)
          await step(
            '照合の画面（Storybook の ForbiddenAfterRevoke）を開いている。照合の API は、照合の権限が無いとして 403 を返す',
          )
          await page.getByTestId('receipt-visits-file').setInputFiles({
            name: 'visits.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('訪問日'),
          })
          await page.getByTestId('receipt-check-submit').click()
          await step('実績の CSV を選び、照合するを押す')
          await expect(page.getByTestId('receipt-check-error')).toHaveText(
            'この操作をする権限がありません。',
          )
          await check('照合の失敗の文に「この操作をする権限がありません。」が出る')
        },
      )
    })

    test(`${prefix}職員の管理の権限が要る画面を権限の無い職員が開いた場合、頼む相手を事業所の管理者と書いた文が出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-common-pageforbiddenmessage--default')
      const open = openStory(url, (page) => page.getByTestId('page-forbidden'))
      await recordPrEvidence(
        browser,
        {
          name: 'page-forbidden-ask-admin',
          title: '権限が無い画面の文は、頼む相手を事業所の管理者と書く',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, check }) => {
          await open(page)
          await expect(page.getByTestId('page-forbidden')).toContainText(
            '職員の管理の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。',
          )
          await check(
            '「職員の管理の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。」が出る',
          )
        },
      )
    })

    test(`${prefix}照合の権限が要る画面を権限の無い職員が開いた場合、頼む相手を事業所の管理者と書いた文が出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-common-pageforbiddenmessage--receipt-check')
      const open = openStory(url, (page) => page.getByTestId('page-forbidden'))
      await recordPrEvidence(
        browser,
        {
          name: 'page-forbidden-receipt-ask-admin',
          title: '照合の権限が無い画面の文は、頼む相手を事業所の管理者と書く',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, check }) => {
          await open(page)
          await expect(page.getByTestId('page-forbidden')).toContainText(
            '照合の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。',
          )
          await check(
            '「照合の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。」が出る',
          )
        },
      )
    })

    test(`${prefix}カレンダーを連携していない職員が自分の情報を開いた場合、連携を事業所の管理者に頼む文が出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-staff-accountprofilecontainer--not-linked')
      const open = openStory(url, (page) => page.getByTestId('account-profile-calendar-not-linked'))
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-not-linked-ask-admin',
          title: 'カレンダーを連携していない職員に、連携を事業所の管理者に頼む文を出す',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, check }) => {
          await open(page)
          await expect(page.getByTestId('account-profile-calendar-not-linked')).toHaveText(
            '連携していません。連携は、事業所の管理者に頼んでください。',
          )
          await check('「連携していません。連携は、事業所の管理者に頼んでください。」が出る')
        },
      )
    })
  }
})
