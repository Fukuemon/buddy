import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { SLOW_STORY_WAIT } from '../../fixtures/timeouts'

const ACTOR = 'ログインなし（Storybook の story）'
const story = (name: string) => storyUrl(`画面-staff-staffdetailcontainer--${name}`)

const openStory = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

test.describe('職員の詳細', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}権限を変えるで対象の選択肢を読んでいる場合、対象を足すを押せず、読み終えると押せること`, async ({
      browser,
    }) => {
      const url = story('slow-target-options')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-target-add-loading',
          title: '対象の職員の選択肢を読み終えるまで、対象を足すを押せない',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '石川 二葉の職員の詳細（Storybook の SlowTargetOptions）を開いている。対象の職員とチームの選択肢は、読み終えるまで 8 秒かかる（架空のデータ）',
          )
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          const option = dialog.getByTestId('staff-policies-option-schedule.user.read')
          await step('権限を変えるを開き、「指定した職員の予定の閲覧」にチェックを入れる')
          await option.check()
          // 役職のまとまりにはチームの閲覧の対象を足すがあるので、ほかの権限のまとまりの中だけを見る
          const add = dialog
            .getByTestId('staff-policies-group-other')
            .getByTestId('staff-policies-target-add')
          await expect(add).toBeDisabled()
          await expect(dialog.getByTestId('staff-policies-target-remove-team-a')).toBeEnabled()
          await check('選択肢を読んでいる間は「＋ 職員を選ぶ」を押せない。チップの × は押せる')

          await step('選択肢を読み終えるまで待ち、「＋ 職員を選ぶ」を押す')
          await expect(add).toBeEnabled(SLOW_STORY_WAIT)
          await add.click()
          await expect(dialog.getByTestId('staff-policies-target-options')).toContainText(
            '上田 三奈',
          )
          await check('読み終えると押せ、候補の職員が並ぶ')
        },
      )
    })

    test(`${prefix}休職の職員の復職にするを送っている場合、メニューを開いたまま復職にしていますを出し、復職にできたら閉じること`, async ({
      browser,
    }) => {
      const url = story('slow-reinstate')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-reinstating',
          title: '復職にするを送っている間は、メニューに「復職にしています」を出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
          await step(
            '休職の江藤 四郎の職員の詳細（Storybook の SlowReinstate）を開いている。復職は、送ってから 4 秒かかる（架空のデータ）',
          )
          await page.getByTestId('staff-detail-menu').click()
          await step('「…」のメニューを開き、「復職にする」を押す')
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page.getByTestId('staff-detail-reinstate')).toHaveText('復職にしています')
          await check('送っている間は、メニューを開いたまま「復職にしています」を出す')

          await expect(page.getByTestId('staff-detail-menu-list')).toBeHidden(SLOW_STORY_WAIT)
          await expect(page.getByTestId('staff-detail-status')).toBeHidden()
          await check('復職にできると、メニューを閉じ、状態の印の「休職」が消える')
        },
      )
    })

    test(`${prefix}復職にできなかった場合、メニューを閉じてタブの上に理由を出すこと`, async ({
      browser,
    }) => {
      const url = story('reinstate-refused')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-reinstate-refused',
          title: '復職にできなかったら、メニューを閉じてタブの上に理由を出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。ほかの職員の操作で退職にしていたので、復職は 1 秒後に拒まれる（架空のデータ）',
          )
          await page.getByTestId('staff-detail-menu').click()
          await step('「…」のメニューを開き、「復職にする」を押す')
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
            '退職した職員は変えられません。',
          )
          await expect(page.getByTestId('staff-detail-menu-list')).toBeHidden()
          await check('メニューを閉じ、タブの上に「退職した職員は変えられません。」を出す')
        },
      )
    })

    /** 復職を拒まれ、タブの上に理由の文が出るまで進める。 */
    const refuseReinstate = async (page: Page, step: (text: string) => Promise<void>) => {
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-reinstate').click()
      await expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
        '退職した職員は変えられません。',
        SLOW_STORY_WAIT,
      )
      await step('「…」の「復職にする」を押し、拒まれて、タブの上に理由の文が出る')
    }

    test(`${prefix}復職にできなかった後にタブを替えた場合、復職の失敗の文を出したままにすること`, async ({
      browser,
    }) => {
      const url = story('reinstate-refused')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-reinstate-error-keeps-on-tab',
          title: 'タブを替えても、復職の失敗の文を出したままにする',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。復職は 1 秒後に拒まれる（架空のデータ）',
          )
          await refuseReinstate(page, step)
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await step('タブの「権限」を押す')
          await page.getByTestId('staff-detail-tab-profile').click()
          await expect(page.getByTestId('staff-detail-profile')).toBeVisible()
          await expect(page.getByTestId('staff-detail-reinstate-error')).toBeVisible()
          await check('タブの「プロフィール」に戻しても、復職の失敗の文が出ている')
        },
      )
    })

    test(`${prefix}復職にできなかった後に編集のダイアログを開いた場合、復職の失敗の文を消すこと`, async ({
      browser,
    }) => {
      const url = story('reinstate-refused')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-reinstate-error-cleared-by-dialog',
          title: 'ほかの操作のダイアログを開くと、復職の失敗の文を消す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。復職は 1 秒後に拒まれる（架空のデータ）',
          )
          await refuseReinstate(page, step)
          await page.getByTestId('staff-detail-edit').click()
          await expect(page.getByTestId('staff-detail-edit-dialog')).toBeVisible()
          await step('見出しの「編集」を押し、プロフィールの編集を開く')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('staff-detail-edit-dialog')).toBeHidden()
          await expect(page.getByTestId('staff-detail-reinstate-error')).toBeHidden()
          await check('編集のダイアログを閉じた後も、復職の失敗の文は消えたままである')
        },
      )
    })

    test(`${prefix}復職にできなかった後にもう一度復職にするを押した場合、送っている間は前の失敗の文を出さないこと`, async ({
      browser,
    }) => {
      const url = story('slow-reinstate-refused')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-reinstate-error-cleared-by-retry',
          title: 'もう一度復職にするを押すと、送っている間は前の失敗の文を消す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '休職の江藤 四郎の職員の詳細（Storybook の SlowReinstateRefused）を開いている。復職は 4 秒後に拒まれる（架空のデータ）',
          )
          await refuseReinstate(page, step)
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page.getByTestId('staff-detail-reinstate')).toHaveText('復職にしています')
          await expect(page.getByTestId('staff-detail-reinstate-error')).toBeHidden()
          await check('もう一度「復職にする」を押すと、送っている間は前の失敗の文が消える')
          await expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
            '退職した職員は変えられません。',
            SLOW_STORY_WAIT,
          )
          await check('また拒まれると、理由の文をもう一度出す')
        },
      )
    })

    test(`${prefix}権限を変えるを開いた場合、予定の 7 つの権限、職員の管理、照合の順に並ぶこと`, async ({
      browser,
    }) => {
      const url = story('default')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-policies-order',
          title: '権限を変えるダイアログは、予定の 7 つの権限の後に、職員の管理と照合を並べる',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step('石川 二葉の職員の詳細（Storybook の Default）を開いている（架空のデータ）')
          await page.getByTestId('staff-detail-tab-policies').click()
          await step('権限のタブで「権限を変える」を押す')
          await page.getByTestId('staff-detail-policies-change').click()
          const other = page.getByTestId('staff-policies-group-other')
          const topOf = async (code: string) =>
            (await other.getByTestId(`staff-policies-option-${code}`).boundingBox())?.y ?? 0
          await expect(other.getByTestId('staff-policies-option-receipt.check')).toBeVisible()
          const [allEdit, staffManage, receiptCheck] = await Promise.all(
            ['schedule.all.edit', 'staff.manage', 'receipt.check'].map(topOf),
          )
          expect(allEdit).toBeLessThan(staffManage)
          expect(staffManage).toBeLessThan(receiptCheck)
          await check(
            '「ほかの権限」で、予定の権限（最後は「事業所の全ての予定の編集」）の後に、「職員の管理」「照合」の順で並ぶ',
          )
        },
      )
    })

    test(`${prefix}送った権限の変更が全て拒まれた場合、権限を変えられませんでしたの前置きで理由を出すこと`, async ({
      browser,
    }) => {
      const url = story('self')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-policies-all-refused',
          title: '送った権限の変更が全て拒まれたら、ほかの変更を保存したとは示さない',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '自分（職員の管理の権限を持つ最後の有効な職員）の詳細（Storybook の Self）を開いている（架空のデータ）',
          )
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await step('権限を変えるで、「職員の管理」のチェックだけを外して保存する')
          await dialog.getByTestId('staff-policies-option-staff.manage').uncheck()
          await dialog.getByTestId('staff-policies-submit').click()
          await expect(dialog.getByTestId('staff-policies-error')).toHaveText(
            '権限を変えられませんでした。職員の管理: 職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
          )
          await check(
            '「権限を変えられませんでした。」の後に理由を出し、「ほかの変更は保存しました。」は出さない',
          )
        },
      )
    })

    test(`${prefix}プロフィールの編集で部署の選択肢を読んでいる場合も、保存できること`, async ({
      browser,
    }) => {
      const url = story('slow-departments')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-profile-save-loading',
          title: '部署の選択肢を読んでいる間も、プロフィールの編集を保存できる',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '石川 二葉の職員の詳細（Storybook の SlowDepartments）を開いている。部署の選択肢は、読み終えるまで 8 秒かかる（架空のデータ）',
          )
          await page.getByTestId('staff-detail-edit').click()
          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await step('編集を開き、名前を「石川 双葉」に変える')
          await dialog.getByTestId('staff-detail-name-input').fill('石川 双葉')
          await expect(dialog.getByTestId('staff-detail-department-input')).toBeDisabled()
          await expect(dialog.getByTestId('staff-detail-save')).toBeEnabled()
          await check('部署の選択は読んでいる間押せないが、保存は押せる')

          await step('保存を押す')
          await dialog.getByTestId('staff-detail-save').click()
          await expect(page.getByTestId('staff-detail-name')).toHaveText('石川 双葉')
          await check('ダイアログを閉じ、名前が「石川 双葉」になる')
        },
      )
    })

    test(`${prefix}役職を変えるで役職を読んでいる場合、役職を変えるときの注意を出さず、読み終えると出すこと`, async ({
      browser,
    }) => {
      const url = story('slow-positions')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-position-note-loading',
          title: '役職を読み終えるまで、役職を変えるときの注意を出さない',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '石川 二葉の職員の詳細（Storybook の SlowPositions）を開いている。役職は、読み終えるまで 8 秒かかる（架空のデータ）',
          )
          await step('プロフィールの「役職を変える」を押す')
          await page.getByTestId('staff-detail-position-change').click()
          const dialog = page.getByTestId('staff-position-dialog')
          await expect(dialog).toBeVisible()
          await expect(dialog.getByTestId('staff-position-note')).toHaveCount(0)
          await check('役職を読んでいる間は、注意の文を出さない')

          await expect(dialog.getByTestId('staff-position-note')).toBeVisible(SLOW_STORY_WAIT)
          await check('役職を読み終えると、権限が置き換わることを示す注意の文を出す')
        },
      )
    })
  }
})
