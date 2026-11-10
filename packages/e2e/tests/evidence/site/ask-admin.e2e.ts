import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

/** story を開き、描かれたことを示す要素が見えるまで待つ。 */
const openStory = async (page: Page, id: string, shown: Locator) => {
  await page.goto(storyUrl(id))
  await expect(shown).toBeVisible()
}

test.describe('頼む相手の呼び方と、権限を外されたときの文', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test('receipt-check-forbidden-after-revoke 照合で画面を開いた後に照合の権限を外された職員が照合するを押した場合、「この操作をする権限がありません。」が出ること', async ({
      page,
    }) => {
      await openStory(
        page,
        '画面-receipt-receiptcheckformcontainer--forbidden-after-revoke',
        page.getByTestId('receipt-check-form'),
      )
      await intro(
        page,
        '照合の権限を外された後に照合すると、規約の文を出す\n前提 照合の画面（Storybook の ForbiddenAfterRevoke）を開いている。照合の API は、照合の権限が無いとして 403 を返す',
      )

      await step(page, '実績の CSV を選び、照合するを押す', async () => {
        await page.getByTestId('receipt-visits-file').setInputFiles({
          name: 'visits.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('訪問日'),
        })
        await page.getByTestId('receipt-check-submit').click()
      })
      await check(page, '照合の失敗の文に「この操作をする権限がありません。」が出る', () =>
        expect(page.getByTestId('receipt-check-error')).toHaveText(
          'この操作をする権限がありません。',
        ),
      )
    })

    test('page-forbidden-ask-admin 職員の管理の権限が要る画面を権限の無い職員が開いた場合、頼む相手を事業所の管理者と書いた文が出ること', async ({
      page,
    }) => {
      await openStory(
        page,
        '画面-common-pageforbiddenmessage--default',
        page.getByTestId('page-forbidden'),
      )
      await intro(page, '権限が無い画面の文は、頼む相手を事業所の管理者と書く')

      const text =
        '職員の管理の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。'
      await check(page, `「${text}」が出る`, () =>
        expect(page.getByTestId('page-forbidden')).toContainText(text),
      )
    })

    test('page-forbidden-receipt-ask-admin 照合の権限が要る画面を権限の無い職員が開いた場合、頼む相手を事業所の管理者と書いた文が出ること', async ({
      page,
    }) => {
      await openStory(
        page,
        '画面-common-pageforbiddenmessage--receipt-check',
        page.getByTestId('page-forbidden'),
      )
      await intro(page, '照合の権限が無い画面の文は、頼む相手を事業所の管理者と書く')

      const text =
        '照合の権限を持つ職員だけが開けます。権限が要るときは、事業所の管理者に頼んでください。'
      await check(page, `「${text}」が出る`, () =>
        expect(page.getByTestId('page-forbidden')).toContainText(text),
      )
    })

    test('account-profile-not-linked-ask-admin カレンダーを連携していない職員が自分の情報を開いた場合、連携を事業所の管理者に頼む文が出ること', async ({
      page,
    }) => {
      const notLinked = page.getByTestId('account-profile-calendar-not-linked')
      await openStory(page, '画面-staff-accountprofilecontainer--not-linked', notLinked)
      await intro(page, 'カレンダーを連携していない職員に、連携を事業所の管理者に頼む文を出す')

      const text = '連携していません。連携は、事業所の管理者に頼んでください。'
      await check(page, `「${text}」が出る`, () => expect(notLinked).toHaveText(text))
    })
  })
})
