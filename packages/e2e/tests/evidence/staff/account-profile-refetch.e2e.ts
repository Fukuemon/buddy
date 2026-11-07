import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const story = (name: string) => storyUrl(`画面-staff-accountprofilecontainer--${name}`)

/** 職員がほかのウィンドウからこの画面に戻ったときと同じ合図を送り、画面にデータを読み直させる。 */
const returnToWindow = async (page: Page) => {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
}

test.describe('自分の情報の読み直し', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}読み終えた後にウィンドウに戻って読み直し、読めなかった場合、表示を残して失敗の文と読み直すが出ること`, async ({
      browser,
    }) => {
      const url = story('refetch-error')
      const open = async (page: Page) => {
        await page.goto(url)
        await expect(page.getByTestId('account-profile-name')).toBeVisible()
      }
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-refetch-error',
          title: '読み直して読めなかったときは、表示を残して失敗の文と読み直すを出す',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, step, check }) => {
          await open(page)
          await step(
            '自分の情報（Storybook の RefetchError）を読み終えている。次に読み直すと、自分の情報を読めない（架空のデータ）',
          )
          await returnToWindow(page)
          await step('ほかのウィンドウからこの画面に戻り、画面が自分の情報を読み直す')
          await expect(page.getByTestId('refetch-error')).toContainText(
            '最新の情報を読み込めませんでした。',
          )
          await expect(page.getByTestId('account-profile-name')).toBeVisible()
          await expect(page.getByTestId('account-profile-error')).toBeHidden()
          await check(
            '読み終えた表示を残し、タイトルの下に「最新の情報を読み込めませんでした。」と読み直すが出る',
          )
        },
      )
    })

    test(`${prefix}読み直して読めなかった後に読み直すを押し、読めた場合、失敗の文と読み直すが消えること`, async ({
      browser,
    }) => {
      const url = story('refetch-error')
      const open = async (page: Page) => {
        await page.goto(url)
        await expect(page.getByTestId('account-profile-name')).toBeVisible()
      }
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-refetch-retry',
          title: '読み直すを押して読めたら、失敗の文と読み直すを消す',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, step, check }) => {
          await open(page)
          await step(
            '自分の情報（Storybook の RefetchError）を読み終えている。次の読み直しは失敗し、その次は読める（架空のデータ）',
          )
          await returnToWindow(page)
          await expect(page.getByTestId('refetch-error')).toBeVisible()
          await step('ウィンドウに戻って読み直し、読めずに失敗の文と読み直すが出る')
          await page.getByTestId('refetch-retry').click()
          await expect(page.getByTestId('refetch-error')).toBeHidden()
          await expect(page.getByTestId('account-profile-name')).toBeVisible()
          await check('読み直すを押して読めると、失敗の文と読み直すが消える')
        },
      )
    })

    test(`${prefix}自分の情報を一度も読めなかった場合、画面の全体に読み込みの失敗の文と読み直すが出ること`, async ({
      browser,
    }) => {
      const url = story('load-error')
      const open = async (page: Page) => {
        await page.goto(url)
        await expect(page.getByTestId('account-profile-error')).toBeVisible()
      }
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-load-error',
          title: '一度も読めなかったときは、画面の全体を読み込みの失敗にする',
          actor: ACTOR,
          variant,
        },
        open,
        async ({ page, step, check }) => {
          await open(page)
          await step(
            '自分の情報（Storybook の LoadError）を開いた。自分の情報を読めない（架空のデータ）',
          )
          await expect(page.getByTestId('account-profile-retry')).toBeVisible()
          await expect(page.getByTestId('refetch-error')).toBeHidden()
          await check(
            '「自分の情報を読み込めませんでした。時間をおいて、読み直してください。」と読み直すが出て、最新の情報の文は出ない',
          )
        },
      )
    })
  }
})
