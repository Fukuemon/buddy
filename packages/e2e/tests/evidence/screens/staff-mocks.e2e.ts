import { type Browser, type Page, expect, test } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  mockUrl,
  recordPrEvidence,
} from '../../fixtures/evidence'
import { pageRoot } from '../../selectors/page'

const LIST = 'staff-list_職員の一覧/mocks'
const NEW = 'staff-new_職員の登録/mocks'
const DETAIL = 'staff-detail_職員の詳細/mocks'

type Steps = Parameters<Parameters<typeof recordPrEvidence>[3]>[0]

/** モックを開いてから、観点の操作を撮る。ログインしないので、prepare では同じモックを開くだけにする */
async function recordMock(
  browser: Browser,
  variant: (typeof EVIDENCE_VARIANTS)[number],
  o: { name: string; title: string; file: string; isPhone?: boolean },
  body: (steps: Steps & { page: Page }) => Promise<void>,
) {
  await recordPrEvidence(
    browser,
    {
      name: o.name,
      title: o.title,
      actor: 'ログインなし',
      variant,
      ...(o.isPhone ? { viewport: PHONE_VIEWPORT } : {}),
    },
    async (page) => {
      await page.goto(mockUrl(o.file))
    },
    async (steps) => {
      await steps.page.goto(mockUrl(o.file))
      await body(steps)
    },
  )
}

test.describe('職員の管理の画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}パソコンの幅で職員の一覧のモックを開いた場合、有効の職員だけがチームの順に並び、状態のカラムが無く、行を押すと職員の詳細へ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-desktop',
          title:
            '職員の一覧は、有効の職員だけを、名前、チーム、役職、部署のカラムでチームの順に並べ、チームの名前の前に色の点を置く',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 有効')
          await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
          await expect(page.getByTestId('staff-list-table')).not.toContainText('状態')
          await expect(page.getByTestId('staff-list-row-{職員の id}').first()).toContainText(
            '東チーム',
          )
          await expect(page.getByTestId('staff-list-row-{職員の id}').last()).toContainText(
            '南チーム',
          )
          await check(
            '「状態: 有効」で「5 人」が出て、状態のカラムが無く、東、西、南のチームの順に、色の点とチームの名前が並ぶ',
          )

          await step('林 さくら の行を押す')
          await page.getByTestId('staff-list-row-{職員の id}').nth(1).click()
          await expect(page).toHaveURL(/staff-detail_.+\/01-detail\.html/)
          await check('職員の詳細のモック（01-detail.html）へ移る')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で職員の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-phone',
          title:
            'スマートフォンの幅の職員の一覧は、1 行目に名前、2 行目にチームの色の点とチーム、役職、部署を置く',
          file: `${LIST}/01-list.html`,
          isPhone: true,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-list-row-{職員の id}').first()).toHaveCSS(
            'display',
            'flex',
          )
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check(
            '行が 2 行のリストになり、2 行目の先頭にチームの色の点とチームの名前が出て、横にスクロールしない',
          )
        },
      )
    })

    test(`${prefix}職員の一覧のモックで状態の絞り込みを押した場合、休職の職員と戻る予定の日が出るモックへ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-on-leave',
          title:
            '状態の絞り込みを「休職」にすると、休職の職員だけが出て、「戻る予定の日」のカラムを足す',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
          await step('状態の絞り込みを押す')
          await page.getByTestId('staff-list-filter-status').click()
          await expect(page).toHaveURL(/02-on-leave\.html/)
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 休職')
          await expect(page.getByTestId('staff-list-count')).toHaveText('2 人')
          await expect(page.getByTestId('staff-list-leave-return-{職員の id}')).toHaveText([
            '戻る予定の日なし',
            '2027/04/01 に戻る予定',
          ])
          await check(
            '「休職の職員」のモック（02-on-leave.html）へ移り、休職の「2 人」と、「戻る予定の日」のカラムが出る',
          )
        },
      )
    })

    test(`${prefix}休職の職員のモックで状態の絞り込みを押した場合、退職の職員と退職した日が出るモックへ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-retired',
          title:
            '状態の絞り込みを「退職」にすると、退職の職員だけが出て、「退職した日」のカラムを足す',
          file: `${LIST}/02-on-leave.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-list-count')).toHaveText('2 人')
          await step('状態の絞り込みを押す')
          await page.getByTestId('staff-list-filter-status').click()
          await expect(page).toHaveURL(/03-retired\.html/)
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 退職')
          await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
          await expect(page.getByTestId('staff-list-retired-on-{職員の id}')).toHaveText(
            '2026/09/30 に退職',
          )
          await check(
            '「退職の職員」のモック（03-retired.html）へ移り、退職の「1 人」と、「退職した日」のカラムが出る',
          )
        },
      )
    })

    test(`${prefix}職員の一覧で絞り込みに合う職員がいない場合、職員が無いことの文が出て、絞り込みを外すで一覧へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-empty',
          title: '絞り込みで 0 件のときは知らせを出し、「絞り込みを外す」で一覧に戻る',
          file: `${LIST}/04-empty.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-list-empty')).toContainText(
            '条件に合う職員はいません。',
          )
          await expect(page.getByTestId('staff-list-count')).toHaveText('0 人')
          await check(
            '「絞り込みで 0 件」のモック（04-empty.html）に、職員が無いことの文と「絞り込みを外す」が出る',
          )

          await step('「絞り込みを外す」を押す')
          await page.getByTestId('staff-list-filter-clear').click()
          await expect(page).toHaveURL(/01-list\.html/)
          await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
          await check('一覧のモック（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の一覧のモックでヘルプを押した場合、休職と退職の職員の説明が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-list-help',
          title: '? を押すと、休職と退職の職員の扱いの説明が出る',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-list-help-text')).toBeHidden()
          await step('ページのタイトルの右の ? を押す')
          await page.getByTestId('staff-list-help').click()
          await expect(page.getByTestId('staff-list-help-text')).toHaveText(
            '休職と退職の職員は、ログインできず、予定の担当の候補に出ません。',
          )
          await check('ページのタイトルの下に、休職と退職の職員の説明が出る')
        },
      )
    })

    test(`${prefix}職員の登録のモックを開いた場合、入力のダイアログの形で出て、Escape で一覧へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-new-dialog',
          title:
            '職員の登録は、× を置かず、? をタイトルの右に、キャンセルと登録をフッターの右に置く',
          file: `${NEW}/01-initial.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-new-dialog')).toBeVisible()
          await expect(page.getByTestId('staff-new-cancel')).toHaveText('キャンセル')
          await check('入力のダイアログに、?、キャンセル、登録が出て、右上に × が無い')

          await step('? を押す')
          await page.getByTestId('staff-new-help').click()
          await expect(page.getByTestId('staff-new-help-text')).toBeVisible()
          await check('タイトルの下に、いつから使えるかの説明が出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/staff-list_.+\/01-list\.html/)
          await check('職員の一覧のモック（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}有効な職員の詳細のモックを開いた場合、状態の印と在籍の行が出ないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-profile',
          title: '有効な職員のプロフィールには、状態の印と在籍の行を出さない',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-detail-position-name')).toHaveText('メンバー')
          await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-status-text')).toHaveCount(0)
          await check('プロフィール（01-detail.html）に、状態の印と在籍の行が無い')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで権限のタブを押した場合、付いている権限だけが付いた理由のまとまりで並ぶこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-policies',
          title:
            '権限のタブは、付いている権限だけを、役職で付く権限と個別に足した権限のまとまりに分けて並べる',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('タブの「権限」を押す')
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page).toHaveURL(/02-policies\.html/)
          await expect(page.getByTestId('staff-policy-row-{権限の code}')).toHaveCount(2)
          await expect(page.getByTestId('staff-policy-group-position')).toContainText(
            '役職「メンバー」で付く権限',
          )
          await expect(page.getByTestId('staff-policy-group-individual')).toContainText(
            '個別に足した権限',
          )
          await expect(page.getByTestId('staff-policy-targets-{権限の code}')).toHaveText(
            '森 健太、佐藤 美咲',
          )
          await check(
            '権限のタブ（02-policies.html）に、付いている 2 つの権限がまとまりごとに並び、対象は 2 行目にだけ出る',
          )
        },
      )
    })

    test(`${prefix}スマートフォンの幅で職員の詳細の権限のタブを開いた場合、パソコンの幅と同じ形で横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-policies-phone',
          title: 'スマートフォンの幅の権限の一覧は、パソコンの幅と同じまとまりと 2 行の形で出す',
          file: `${DETAIL}/02-policies.html`,
          isPhone: true,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-policy-targets-{権限の code}')).toBeVisible()
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check('権限の一覧がまとまりと 2 行の形のまま出て、横にスクロールしない')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで「…」を押した場合、休職にすると赤の退職にするのメニューが開き、Escape で閉じること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-menu',
          title: '「…」を押すと、休職にすると退職にするのメニューが開き、Escape で閉じる',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('「…」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await expect(page).toHaveURL(/03-menu\.html/)
          await expect(page.getByTestId('staff-detail-leave')).toBeVisible()
          await expect(page.getByTestId('staff-detail-retire')).toHaveClass(/wf-menu__item--danger/)
          await check('「…」のメニュー（03-menu.html）に、休職にすると、赤の退職にするが出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('メニューが閉じ、プロフィール（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで編集を押した場合、プロフィールの編集のダイアログが開き、キャンセルで戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-edit',
          title: '編集を押すとプロフィールの編集のダイアログが開き、フッターのキャンセルで閉じる',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('「編集」を押す')
          await page.getByTestId('staff-detail-edit').click()
          await expect(page).toHaveURL(/04-edit\.html/)
          await expect(page.getByTestId('staff-detail-team-input')).toHaveText('西チーム')
          await check(
            'プロフィールの編集のダイアログ（04-edit.html）に、名前、メールアドレス、電話番号、部署、チームが出る',
          )

          await step('フッターの「キャンセル」を押す')
          await page.getByTestId('staff-detail-edit-cancel').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('プロフィール（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで役職を変えるを押した場合、個別に足した権限が消える注意と赤のボタンが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-position',
          title:
            '役職を変えるダイアログに、個別に足した権限が消える注意と赤の「役職を変える」が出る',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('「役職を変える」を押す')
          await page.getByTestId('staff-detail-position-change').click()
          await expect(page).toHaveURL(/05-position\.html/)
          await expect(page.getByTestId('staff-position-note')).toContainText(
            '個別に足した権限（指定した職員の予定の閲覧）は消えます。',
          )
          await expect(page.getByTestId('staff-position-submit')).toHaveClass(/wf-btn--danger/)
          await check(
            '役職を変えるダイアログ（05-position.html）に、消える権限の注意と赤の「役職を変える」が出る',
          )
        },
      )
    })

    test(`${prefix}職員の詳細のモックで権限を変えるを押した場合、まとまりごとのチェックボックスと選んだ対象のチップが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-policies-dialog',
          title:
            '権限を変えるダイアログは、役職で付く権限とほかの権限のまとまりにチェックボックスを並べ、対象は選んだものだけをチップで出す',
          file: `${DETAIL}/02-policies.html`,
        },
        async ({ page, step, check }) => {
          await step('「権限を変える」を押す')
          await page.getByTestId('staff-detail-policies-change').click()
          await expect(page).toHaveURL(/06-policies\.html/)
          await expect(page.getByTestId('staff-policies-group-position')).toContainText(
            '役職「メンバー」で付く権限',
          )
          await expect(page.getByTestId('staff-policies-group-other')).toContainText('ほかの権限')
          await expect(page.getByTestId('staff-policies-option-{権限の code}')).toHaveCount(9)
          await expect(page.getByTestId('staff-policies-target-{職員の id}')).toHaveCount(2)
          await expect(
            page.getByTestId('staff-policies-target-remove-{職員の id}').first(),
          ).toHaveAttribute('aria-label', '森 健太 を外す')
          await check(
            '権限を変えるダイアログ（06-policies.html）に、2 つのまとまりと 9 つのチェックボックス、選んだ 2 人のチップと「＋ 職員を選ぶ」が出る',
          )

          await step('「指定した職員の予定の編集」にチェックを付ける')
          const options = page.getByTestId('staff-policies-option-{権限の code}')
          await options.nth(2).click()
          await expect(options.nth(2)).toHaveAttribute('aria-checked', 'true')
          await check('ほかの権限のチェックを付けられる')
        },
      )
    })

    test(`${prefix}権限を変えるダイアログで対象を足すを押した場合、選んでいない職員の候補が開き、Escape で閉じること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-policies-target',
          title:
            '「＋ 職員を選ぶ」を押すと、選んでいない職員の候補が開き、Escape で候補だけを閉じる',
          file: `${DETAIL}/06-policies.html`,
        },
        async ({ page, step, check }) => {
          await step('「＋ 職員を選ぶ」を押す')
          await page.getByTestId('staff-policies-target-add').click()
          await expect(page).toHaveURL(/16-policies-target\.html/)
          await expect(page.getByTestId('staff-policies-target-option-{職員の id}')).toHaveCount(3)
          await expect(page.getByTestId('staff-policies-target-add')).toHaveAttribute(
            'aria-expanded',
            'true',
          )
          await check('対象を足す（16-policies-target.html）に、選んでいない 3 人の候補が出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/06-policies\.html/)
          await expect(page.getByTestId('staff-policies-dialog')).toBeVisible()
          await check('候補だけが閉じ、権限を変えるダイアログ（06-policies.html）は開いたまま')
        },
      )
    })

    test(`${prefix}権限の保存の一部が拒まれた場合、外せなかった権限にチェックが残り、理由が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-policies-error',
          title:
            '権限の保存の一部が拒まれると、ダイアログを閉じずに、読み直した権限で選択を出し、変えられなかった権限と理由を出す',
          file: `${DETAIL}/07-policies-error.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-policies-error')).toContainText(
            '職員の管理: 職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
          )
          await expect(
            page
              .getByTestId('staff-policies-option-{権限の code}')
              .filter({ hasText: '職員の管理' }),
          ).toHaveAttribute('aria-checked', 'true')
          await check(
            '権限の保存の一部の失敗（07-policies-error.html）に、チェックが残った職員の管理と、変えられなかった理由が出る',
          )
        },
      )
    })

    test(`${prefix}休職の確認で休職にした場合、休職の職員になり、「…」に復職にするが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-leave',
          title: '休職の確認から休職にすると休職の職員になり、「…」のメニューに復職にするが出る',
          file: `${DETAIL}/03-menu.html`,
        },
        async ({ page, step, check }) => {
          await step('「休職にする」を押す')
          await page.getByTestId('staff-detail-leave').click()
          await expect(page).toHaveURL(/08-leave\.html/)
          await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
          await expect(page.getByTestId('staff-leave-submit')).toHaveClass(/wf-btn--primary/)
          await check(
            '休職の確認（08-leave.html）に、残る予定と担当の利用者と、青の「休職にする」が出る',
          )

          await step('「休職にする」を押す')
          await page.getByTestId('staff-leave-submit').click()
          await expect(page).toHaveURL(/09-on-leave\.html/)
          await expect(page.getByTestId('staff-detail-status')).toHaveText(
            '休職（2027/04/01 に戻る予定）',
          )
          await check('休職の職員（09-on-leave.html）になる')

          await step('「…」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await expect(page.getByTestId('staff-detail-reinstate')).toBeVisible()
          await check('「…」のメニュー（10-on-leave-menu.html）に、復職にすると退職にするが出る')
        },
      )
    })

    test(`${prefix}休職の職員の「…」で復職にした場合、有効の職員に戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-reinstate',
          title: '休職の職員の「…」のメニューで復職にすると、有効の職員に戻る',
          file: `${DETAIL}/10-on-leave-menu.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('staff-detail-status')).toHaveText(
            '休職（2027/04/01 に戻る予定）',
          )
          await step('「復職にする」を押す')
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
          await check('有効の職員のプロフィール（01-detail.html）に戻り、状態の印が消える')
        },
      )
    })

    test(`${prefix}休職の職員の詳細のモックを開いた場合、在籍の行に状態の印に書けないことだけが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-on-leave',
          title:
            '休職の職員の在籍の行は、休職の開始日と、戻る予定の日に自動では戻らないことだけを書く',
          file: `${DETAIL}/09-on-leave.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-detail-status')).toHaveText(
            '休職（2027/04/01 に戻る予定）',
          )
          await expect(page.getByTestId('staff-detail-status-text')).toHaveText(
            '2026/10/31 から休職です。戻る予定の日に自動では戻りません。',
          )
          await check('休職の職員（09-on-leave.html）の在籍の行が、戻る予定の日を繰り返さない')
        },
      )
    })

    test(`${prefix}退職した職員の詳細のモックを開いた場合、メールアドレスと電話番号の行が出ず、消したことを在籍の 1 文に書くこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-retired',
          title:
            '退職した職員は、メールアドレスと電話番号を空で出さず、消したことを在籍に 1 回だけ書く',
          file: `${DETAIL}/13-retired.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-detail-email')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-phone')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-status-text')).toContainText(
            'メールアドレスと電話番号は退職で消し',
          )
          await check(
            '退職した職員（13-retired.html）に、メールアドレスと電話番号の行が無く、在籍に消したことが出る',
          )
        },
      )
    })

    test(`${prefix}退職の確認で退職にした場合、退職した職員になり、編集と「…」が出ないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-retire',
          title:
            '退職の確認の赤の「退職にする」を押すと、退職した職員になり、編集と「…」が無くなる',
          file: `${DETAIL}/03-menu.html`,
        },
        async ({ page, step, check }) => {
          await step('「退職にする」を押す')
          await page.getByTestId('staff-detail-retire').click()
          await expect(page).toHaveURL(/11-retire\.html/)
          await expect(page.getByTestId('staff-retire-submit')).toHaveClass(/wf-btn--danger/)
          await check('退職の確認（11-retire.html）に、退職の注意と赤の「退職にする」が出る')

          await step('「退職にする」を押す')
          await page.getByTestId('staff-retire-submit').click()
          await expect(page).toHaveURL(/13-retired\.html/)
          await expect(page.getByTestId('staff-detail-status')).toHaveText('退職（2026/09/30）')
          await expect(page.getByTestId('staff-detail-edit')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-menu')).toHaveCount(0)
          await check('退職した職員（13-retired.html）になり、編集と「…」が出ない')
        },
      )
    })

    test(`${prefix}予定が残る職員を退職にしようとした場合、退職にするが押せないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'staff-detail-retire-refused',
          title: '予定か担当の利用者が残る職員の退職のダイアログでは、退職にするが押せない',
          file: `${DETAIL}/12-retire-refused.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('staff-retire-assignments')).toBeVisible()
          await expect(page.getByTestId('staff-retire-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await check(
            '退職を拒む（12-retire-refused.html）に、残る予定と担当の利用者が出て、「退職にする」が押せない',
          )
        },
      )
    })
  }
})
