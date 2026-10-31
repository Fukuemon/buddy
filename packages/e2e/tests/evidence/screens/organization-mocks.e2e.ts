import { type Browser, type Page, expect, test } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  mockUrl,
  recordPrEvidence,
} from '../../fixtures/evidence'
import { pageRoot } from '../../selectors/page'

const MOCKS = 'organization-list_部署とチーム/mocks'

type Steps = Parameters<Parameters<typeof recordPrEvidence>[3]>[0]

/** モックを開いてから、観点の操作を撮る。ログインしないので、prepare では同じモックを開くだけにする */
async function recordMock(
  browser: Browser,
  variant: (typeof EVIDENCE_VARIANTS)[number],
  o: { name: string; title: string; file: string; phone?: boolean },
  body: (steps: Steps & { page: Page }) => Promise<void>,
) {
  await recordPrEvidence(
    browser,
    {
      name: o.name,
      title: o.title,
      actor: 'ログインなし',
      variant,
      ...(o.phone ? { viewport: PHONE_VIEWPORT } : {}),
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

test.describe('部署とチームの画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}パソコンの幅で部署とチームのモックを開いた場合、部署とチームの一覧が並び、チームの名前の前に色の点が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-list-desktop',
          title:
            '部署とチームの画面は、部署の一覧とチームの一覧を縦に並べ、チームにだけ色の点を置き、行の右端に「編集」を置く',
          file: `${MOCKS}/01-list.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('site-nav-organization')).toHaveAttribute(
            'aria-current',
            'page',
          )
          await expect(page.getByTestId('organization-list-department-row-{部署の id}')).toHaveText(
            [/リハビリ部/, /看護部/],
          )
          await expect(page.getByTestId('organization-list-team-name-{チームの id}')).toHaveText([
            '南チーム',
            '東チーム',
            '西チーム',
          ])
          await expect(
            page.getByTestId('organization-list-team-edit-{チームの id}').first(),
          ).toHaveText('編集')
          await check(
            'ナビゲーションの「部署とチーム」に印が付き、部署の 2 行には点が無く、チームの 3 行は色の点と名前が並び、どの行も右端に「編集」がある',
          )
        },
      )
    })

    test(`${prefix}スマートフォンの幅で部署とチームのモックを開いた場合、行が 1 行に名前と編集を並べ、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-list-phone',
          title: 'スマートフォンの幅では、どの行も名前と「編集」を 1 行に並べる',
          file: `${MOCKS}/01-list.html`,
          phone: true,
        },
        async ({ page, check }) => {
          const row = page.getByTestId('organization-list-team-row-{チームの id}').first()
          await expect(row).toHaveCSS('display', 'flex')
          const name = await page
            .getByTestId('organization-list-team-name-{チームの id}')
            .first()
            .boundingBox()
          const edit = await page
            .getByTestId('organization-list-team-edit-{チームの id}')
            .first()
            .boundingBox()
          expect(
            Math.abs(
              (name?.y ?? 0) + (name?.height ?? 0) / 2 - ((edit?.y ?? 0) + (edit?.height ?? 0) / 2),
            ),
          ).toBeLessThan(8)
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check('チームの行の名前と「編集」が同じ行に並び、横にスクロールしない')
        },
      )
    })

    test(`${prefix}部署とチームのモックで部署を作るを押した場合、名前が空の部署の作成のダイアログが開き、キャンセルで一覧へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-department-new',
          title:
            '「部署を作る」を押すと、名前だけの入力のダイアログが開き、「キャンセル」で一覧へ戻る',
          file: `${MOCKS}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('「部署を作る」を押す')
          await page.getByTestId('organization-list-department-new').click()
          await expect(page).toHaveURL(/02-department-new\.html/)
          await expect(page.getByTestId('organization-list-department-dialog')).toContainText(
            '部署を作る',
          )
          await expect(page.getByTestId('organization-list-department-name')).toHaveText('')
          await expect(page.getByTestId('organization-list-department-submit')).toHaveText('作る')
          await check(
            '「部署を作る」のダイアログが開き、名前は空で、色の欄は無く、フッターに「キャンセル」と「作る」が出る',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('organization-list-department-cancel').click()
          await expect(page).toHaveURL(/01-list\.html/)
          await check('一覧のモック（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}部署の行の編集を押した場合、今の名前が入った部署の編集のダイアログが開くこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-department-edit',
          title: '部署の行の「編集」を押すと、今の名前を入れた「部署を編集」のダイアログが開く',
          file: `${MOCKS}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('看護部の行の「編集」を押す')
          await page.getByTestId('organization-list-department-edit-{部署の id}').nth(1).click()
          await expect(page).toHaveURL(/03-department-edit\.html/)
          await expect(page.getByTestId('organization-list-department-dialog')).toContainText(
            '部署を編集',
          )
          await expect(page.getByTestId('organization-list-department-name')).toHaveText('看護部')
          await expect(page.getByTestId('organization-list-department-submit')).toHaveText('保存')
          await check(
            '「部署を編集」のダイアログが開き、名前に「看護部」が入り、主ボタンは「保存」',
          )
        },
      )
    })

    test(`${prefix}チームを作るを押した場合、8 色が点と名前で並び、事業所でまだ使っていない色が選ばれ、色を押すと選び替わること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-team-new',
          title:
            '「チームを作る」を押すと、8 色を点と名前で並べた色の欄が開き、まだ使っていない青緑を選んで始める',
          file: `${MOCKS}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('「チームを作る」を押す')
          await page.getByTestId('organization-list-team-new').click()
          await expect(page).toHaveURL(/04-team-new\.html/)
          await expect(page.getByTestId('organization-list-team-color')).toHaveText(
            '青オレンジ赤紫青緑黄紫緑黄緑',
          )
          await expect(page.getByTestId('organization-list-team-color-cyan')).toHaveAttribute(
            'aria-checked',
            'true',
          )
          await check(
            '色の欄に 8 色が点と名前で並び、事業所のチームが使っていない「青緑」が選ばれている',
          )

          await step('「黄」を押す')
          await page.getByTestId('organization-list-team-color-yellow').click()
          await expect(page.getByTestId('organization-list-team-color-yellow')).toHaveAttribute(
            'aria-checked',
            'true',
          )
          await expect(page.getByTestId('organization-list-team-color-cyan')).toHaveAttribute(
            'aria-checked',
            'false',
          )
          await check('「黄」が選ばれ、「青緑」の選択が外れる')
        },
      )
    })

    test(`${prefix}チームの行の編集を押した場合、今の名前と色が選ばれたチームの編集のダイアログが開くこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-team-edit',
          title:
            'チームの行の「編集」を押すと、今の名前と色を選んだ「チームを編集」のダイアログが開く',
          file: `${MOCKS}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('東チームの行の「編集」を押す')
          await page.getByTestId('organization-list-team-edit-{チームの id}').nth(1).click()
          await expect(page).toHaveURL(/05-team-edit\.html/)
          await expect(page.getByTestId('organization-list-team-dialog')).toContainText(
            'チームを編集',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveText('東チーム')
          await expect(page.getByTestId('organization-list-team-color-blue')).toHaveAttribute(
            'aria-checked',
            'true',
          )
          await check(
            '「チームを編集」のダイアログが開き、名前に「東チーム」が入り、色は「青」が選ばれている',
          )
        },
      )
    })

    test(`${prefix}名前を空のまま作るを押した場合、名前の欄の下に入力の誤りの文が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-invalid',
          title: '名前を空のまま「作る」を押すと、名前の欄の下に「名前を入れてください」が出る',
          file: `${MOCKS}/06-invalid.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('organization-list-team-error-name')).toHaveText(
            '名前を入れてください',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveClass(
            /wf-input--invalid/,
          )
          await check(
            '「入力の誤り」のモック（06-invalid.html）で、名前の欄の枠がエラーの色になり、下に「名前を入れてください」が出る',
          )
        },
      )
    })

    test(`${prefix}同じ名前のチームを作ろうとした場合、フッターに保存の失敗の文が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-submit-error',
          title: '事業所にある名前でチームを作ろうとすると、ダイアログを閉じずにフッターに文を出す',
          file: `${MOCKS}/07-submit-error.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('organization-list-team-submit-error')).toHaveText(
            '「東チーム」という名前のチームは、すでにあります。別の名前にしてください。',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveText('東チーム')
          await check(
            '「保存の失敗」のモック（07-submit-error.html）で、入れた名前が残り、フッターの左に同じ名前のチームがあることの文が出る',
          )
        },
      )
    })

    test(`${prefix}部署とチームが無い場合、それぞれの位置に知らせと作るボタンが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-empty',
          title: '部署もチームも無いときは、一覧の位置に知らせを出し、作るボタンは残す',
          file: `${MOCKS}/08-empty.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('organization-list-department-empty')).toHaveText(
            '部署はまだありません。',
          )
          await expect(page.getByTestId('organization-list-team-empty')).toHaveText(
            'チームはまだありません。',
          )
          await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
          await expect(page.getByTestId('organization-list-team-new')).toBeVisible()
          await check(
            '「部署はまだありません。」と「チームはまだありません。」が出て、「部署を作る」と「チームを作る」が残る',
          )
        },
      )
    })

    test(`${prefix}部署とチームを読んでいる場合、読み込み中の表示が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-loading',
          title: '部署とチームを読み終えるまで、一覧の代わりに読み込み中の表示を出す',
          file: `${MOCKS}/09-loading.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('organization-list-loading')).toHaveText('読み込んでいます')
          await expect(page.getByTestId('organization-list-department-new')).toHaveCount(0)
          await check('「読み込んでいます」が出て、一覧と作るボタンは出ない')
        },
      )
    })

    test(`${prefix}部署とチームを読めなかった場合、失敗の文が出て、読み直すで読み込み中へ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-error',
          title: '読めなかったときは失敗の文と「読み直す」を出し、押すと読み込み中に戻る',
          file: `${MOCKS}/10-error.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('organization-list-error')).toHaveText(
            '部署とチームを読み込めませんでした。時間をおいて、読み直してください。',
          )
          await check('読み込みの失敗の文と「読み直す」が出る')

          await step('「読み直す」を押す')
          await page.getByTestId('organization-list-retry').click()
          await expect(page).toHaveURL(/09-loading\.html/)
          await check('読み込み中のモック（09-loading.html）へ移る')
        },
      )
    })

    test(`${prefix}職員の管理の権限が無い場合、権限が無い表示が出て、ナビゲーションに職員のまとまりが無いこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'organization-forbidden',
          title:
            '職員の管理の権限が無いと、権限が無い表示が出て、ナビゲーションに「職員」と「部署とチーム」が出ない',
          file: `${MOCKS}/11-forbidden.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('page-forbidden')).toContainText(
            'この画面を開く権限がありません',
          )
          await expect(page.getByTestId('site-nav-staff')).toHaveCount(0)
          await expect(page.getByTestId('site-nav-organization')).toHaveCount(0)
          await check('権限が無い表示が出て、ナビゲーションに「職員」と「部署とチーム」が無い')

          await step('「予定のカレンダーへ」を押す')
          await page.getByTestId('page-forbidden-back').click()
          await expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/)
          await check('予定のカレンダーのモック（01-month.html）へ移る')
        },
      )
    })
  }
})
