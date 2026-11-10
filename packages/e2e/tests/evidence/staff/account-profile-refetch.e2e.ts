import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const story = (name: string) => storyUrl(`画面-staff-accountprofilecontainer--${name}`)

/** 職員がほかのウィンドウからこの画面に戻ったときと同じ合図を送り、画面にデータを読み直させる。 */
const returnToWindow = async (page: Page) => {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
}

/** 自分の情報を読み終えた story を開く。 */
const openLoaded = async (page: Page) => {
  await page.goto(story('refetch-error'))
  await expect(page.getByTestId('account-profile-name')).toBeVisible()
}

test.describe('自分の情報の読み直し', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test('account-profile-refetch-error 読み終えた後にウィンドウに戻って読み直し、読めなかった場合、表示を残して失敗の文と読み直すが出ること', async ({
      page,
    }) => {
      await openLoaded(page)
      await intro(page, '読み直して読めなかったときは、表示を残して失敗の文と読み直すを出す')

      await check(
        page,
        '前提 自分の情報（Storybook の RefetchError）を読み終えている。次に読み直すと、自分の情報を読めない（架空のデータ）',
        () => expect(page.getByTestId('account-profile-name')).toBeVisible(),
      )
      await step(page, 'ほかのウィンドウからこの画面に戻り、画面が自分の情報を読み直す', () =>
        returnToWindow(page),
      )
      await check(
        page,
        '読み終えた表示を残し、タイトルの下に「最新の情報を読み込めませんでした。」と読み直すが出る',
        async () => {
          await expect(page.getByTestId('refetch-error')).toContainText(
            '最新の情報を読み込めませんでした。',
          )
          await expect(page.getByTestId('account-profile-name')).toBeVisible()
          await expect(page.getByTestId('account-profile-error')).toBeHidden()
        },
      )
    })

    test('account-profile-refetch-retry 読み直して読めなかった後に読み直すを押し、読めた場合、失敗の文と読み直すが消えること', async ({
      page,
    }) => {
      await openLoaded(page)
      await intro(page, '読み直すを押して読めたら、失敗の文と読み直すを消す')

      await check(
        page,
        '前提 自分の情報（Storybook の RefetchError）を読み終えている。次の読み直しは失敗し、その次は読める（架空のデータ）',
        () => expect(page.getByTestId('account-profile-name')).toBeVisible(),
      )
      await step(page, 'ウィンドウに戻って読み直し、読めずに失敗の文と読み直すが出る', async () => {
        await returnToWindow(page)
        await expect(page.getByTestId('refetch-error')).toBeVisible()
      })
      await step(page, '読み直すを押す', () => page.getByTestId('refetch-retry').click())
      await check(page, '読み直すを押して読めると、失敗の文と読み直すが消える', async () => {
        await expect(page.getByTestId('refetch-error')).toBeHidden()
        await expect(page.getByTestId('account-profile-name')).toBeVisible()
      })
    })

    test('account-profile-load-error 自分の情報を一度も読めなかった場合、画面の全体に読み込みの失敗の文と読み直すが出ること', async ({
      page,
    }) => {
      await page.goto(story('load-error'))
      await expect(page.getByTestId('account-profile-error')).toBeVisible()
      await intro(page, '一度も読めなかったときは、画面の全体を読み込みの失敗にする')

      await check(
        page,
        '前提 自分の情報（Storybook の LoadError）を開いた。自分の情報を読めない（架空のデータ）',
        () => expect(page.getByTestId('account-profile-error')).toBeVisible(),
      )
      await check(
        page,
        '「自分の情報を読み込めませんでした。時間をおいて、読み直してください。」と読み直すが出て、最新の情報の文は出ない',
        async () => {
          await expect(page.getByTestId('account-profile-retry')).toBeVisible()
          await expect(page.getByTestId('refetch-error')).toBeHidden()
        },
      )
    })
  })
})
