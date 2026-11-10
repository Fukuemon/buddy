import { type Locator, type Page, expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { pageRoot } from '../../selectors/page'

const MOCKS = 'organization-list_部署とチーム/mocks'
const LIST_PREMISE = '前提 部署とチームの一覧のモック（01-list.html）を開いている'

const TEAM_COLORS = [
  ['blue', '青'],
  ['orange', 'オレンジ'],
  ['magenta', '赤紫'],
  ['cyan', '青緑'],
  ['yellow', '黄'],
  ['purple', '紫'],
  ['green', '緑'],
  ['lime', '黄緑'],
] as const

/** モック file を開き、ready が出るまで待つ。ready は file を開いたことを示す要素にする */
const openMock = async (page: Page, file: string, ready: (page: Page) => Locator) => {
  await page.goto(mockUrl(`${MOCKS}/${file}`))
  await expect(ready(page)).toBeVisible()
}

const departmentNew = (page: Page) => page.getByTestId('organization-list-department-new')

test.describe('部署とチームの画面仕様書のモック', () => {
  test.describe('パソコンの幅（ログインなし、画面仕様書のモック）', () => {
    test('organization-list-desktop パソコンの幅で部署とチームのモックを開いた場合、部署とチームの一覧が並び、チームの名前の前に色の点が出ること', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        `部署とチームの画面は、部署の一覧とチームの一覧を縦に並べ、チームにだけ色の点を置き、行の右端に「編集」を置く\n${LIST_PREMISE}`,
      )

      await check(
        page,
        'ナビゲーションの「部署とチーム」に印が付き、部署の 2 行には点が無く、チームの 3 行は色の点と名前が並び、どの行も右端に「編集」がある',
        async () => {
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
        },
      )
    })

    test('organization-department-new 部署とチームのモックで部署を作るを押した場合、名前が空の部署の作成のダイアログが開き、キャンセルで一覧へ戻ること', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        `「部署を作る」を押すと、名前だけの入力のダイアログが開き、「キャンセル」で一覧へ戻る\n${LIST_PREMISE}`,
      )

      await step(page, '「部署を作る」を押す', () => departmentNew(page).click())
      await check(
        page,
        '「部署を作る」のダイアログが開き、名前は空で、色の欄は無く、フッターに「キャンセル」と「作る」が出る',
        async () => {
          await expect(page).toHaveURL(/02-department-new\.html/)
          await expect(page.getByTestId('organization-list-department-dialog')).toContainText(
            '部署を作る',
          )
          await expect(page.getByTestId('organization-list-department-name')).toHaveText('')
          await expect(page.getByTestId('organization-list-department-submit')).toHaveText('作る')
        },
      )

      await step(page, '「キャンセル」を押す', () =>
        page.getByTestId('organization-list-department-cancel').click(),
      )
      await check(page, '一覧のモック（01-list.html）へ戻る', () =>
        expect(page).toHaveURL(/01-list\.html/),
      )
    })

    test('organization-department-edit 部署の行の編集を押した場合、今の名前が入った部署の編集のダイアログが開くこと', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        `部署の行の「編集」を押すと、今の名前を入れた「部署を編集」のダイアログが開く\n${LIST_PREMISE}`,
      )

      await step(page, '看護部の行の「編集」を押す', () =>
        page.getByTestId('organization-list-department-edit-{部署の id}').nth(1).click(),
      )
      await check(
        page,
        '「部署を編集」のダイアログが開き、名前に「看護部」が入り、主ボタンは「保存」',
        async () => {
          await expect(page).toHaveURL(/03-department-edit\.html/)
          await expect(page.getByTestId('organization-list-department-dialog')).toContainText(
            '部署を編集',
          )
          await expect(page.getByTestId('organization-list-department-name')).toHaveText('看護部')
          await expect(page.getByTestId('organization-list-department-submit')).toHaveText('保存')
        },
      )
    })

    test('organization-team-new チームを作るを押した場合、8 色が点と名前で並び、事業所でまだ使っていない色が選ばれ、色を押すと選び替わること', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        `「チームを作る」を押すと、8 色を点と名前で並べた色の欄が開き、まだ使っていない青緑を選んで始める\n${LIST_PREMISE}`,
      )

      await step(page, '「チームを作る」を押す', () =>
        page.getByTestId('organization-list-team-new').click(),
      )
      await check(
        page,
        '色の欄に 8 色が点と名前で並び、事業所のチームが使っていない「青緑」が選ばれている',
        async () => {
          await expect(page).toHaveURL(/04-team-new\.html/)
          for (const [value, label] of TEAM_COLORS) {
            await expect(page.getByTestId(`organization-list-team-color-${value}`)).toHaveText(
              label,
            )
          }
          await expect(page.getByTestId('organization-list-team-color-cyan')).toHaveAttribute(
            'aria-checked',
            'true',
          )
        },
      )

      await step(page, '「黄」を押す', () =>
        page.getByTestId('organization-list-team-color-yellow').click(),
      )
      await check(page, '「黄」が選ばれ、「青緑」の選択が外れる', async () => {
        await expect(page.getByTestId('organization-list-team-color-yellow')).toHaveAttribute(
          'aria-checked',
          'true',
        )
        await expect(page.getByTestId('organization-list-team-color-cyan')).toHaveAttribute(
          'aria-checked',
          'false',
        )
      })
    })

    test('organization-team-edit チームの行の編集を押した場合、今の名前と色が選ばれたチームの編集のダイアログが開くこと', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        `チームの行の「編集」を押すと、今の名前と色を選んだ「チームを編集」のダイアログが開く\n${LIST_PREMISE}`,
      )

      await step(page, '東チームの行の「編集」を押す', () =>
        page.getByTestId('organization-list-team-edit-{チームの id}').nth(1).click(),
      )
      await check(
        page,
        '「チームを編集」のダイアログが開き、名前に「東チーム」が入り、色は「青」が選ばれている',
        async () => {
          await expect(page).toHaveURL(/05-team-edit\.html/)
          await expect(page.getByTestId('organization-list-team-dialog')).toContainText(
            'チームを編集',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveText('東チーム')
          await expect(page.getByTestId('organization-list-team-color-blue')).toHaveAttribute(
            'aria-checked',
            'true',
          )
        },
      )
    })

    test('organization-invalid 名前を空のまま作るを押した場合、名前の欄の下に入力の誤りの文が出ること', async ({
      page,
    }) => {
      await openMock(page, '06-invalid.html', (p) =>
        p.getByTestId('organization-list-team-error-name'),
      )
      await intro(
        page,
        '名前を空のまま「作る」を押すと、名前の欄の下に「名前を入れてください」が出る\n前提 「入力の誤り」のモック（06-invalid.html）を開いている',
      )

      await check(
        page,
        '「入力の誤り」のモック（06-invalid.html）で、名前の欄の枠がエラーの色になり、下に「名前を入れてください」が出る',
        async () => {
          await expect(page.getByTestId('organization-list-team-error-name')).toHaveText(
            '名前を入れてください',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveClass(
            /wf-input--invalid/,
          )
        },
      )
    })

    test('organization-submit-error 同じ名前のチームを作ろうとした場合、フッターに保存の失敗の文が出ること', async ({
      page,
    }) => {
      await openMock(page, '07-submit-error.html', (p) =>
        p.getByTestId('organization-list-team-submit-error'),
      )
      await intro(
        page,
        '事業所にある名前でチームを作ろうとすると、ダイアログを閉じずにフッターに文を出す\n前提 「保存の失敗」のモック（07-submit-error.html）を開いている',
      )

      await check(
        page,
        '「保存の失敗」のモック（07-submit-error.html）で、入れた名前が残り、フッターの左に同じ名前のチームがあることの文が出る',
        async () => {
          await expect(page.getByTestId('organization-list-team-submit-error')).toHaveText(
            '「東チーム」という名前のチームは、すでにあります。別の名前にしてください。',
          )
          await expect(page.getByTestId('organization-list-team-name')).toHaveText('東チーム')
        },
      )
    })

    test('organization-empty 部署とチームが無い場合、それぞれの位置に知らせと作るボタンが出ること', async ({
      page,
    }) => {
      await openMock(page, '08-empty.html', (p) =>
        p.getByTestId('organization-list-department-empty'),
      )
      await intro(
        page,
        '部署もチームも無いときは、一覧の位置に知らせを出し、作るボタンは残す\n前提 部署とチームが無いときのモック（08-empty.html）を開いている',
      )

      await check(
        page,
        '「部署はまだありません。」と「チームはまだありません。」が出て、「部署を作る」と「チームを作る」が残る',
        async () => {
          await expect(page.getByTestId('organization-list-department-empty')).toHaveText(
            '部署はまだありません。',
          )
          await expect(page.getByTestId('organization-list-team-empty')).toHaveText(
            'チームはまだありません。',
          )
          await expect(departmentNew(page)).toBeVisible()
          await expect(page.getByTestId('organization-list-team-new')).toBeVisible()
        },
      )
    })

    test('organization-loading 部署とチームを読んでいる場合、読み込み中の表示が出ること', async ({
      page,
    }) => {
      await openMock(page, '09-loading.html', (p) => p.getByTestId('organization-list-loading'))
      await intro(
        page,
        '部署とチームを読み終えるまで、一覧の代わりに読み込み中の表示を出す\n前提 読み込み中のモック（09-loading.html）を開いている',
      )

      await check(page, '「読み込んでいます」が出て、一覧と作るボタンは出ない', async () => {
        await expect(page.getByTestId('organization-list-loading')).toHaveText('読み込んでいます')
        await expect(departmentNew(page)).toHaveCount(0)
      })
    })

    test('organization-error 部署とチームを読めなかった場合、失敗の文が出て、読み直すで読み込み中へ移ること', async ({
      page,
    }) => {
      await openMock(page, '10-error.html', (p) => p.getByTestId('organization-list-error'))
      await intro(
        page,
        '読めなかったときは失敗の文と「読み直す」を出し、押すと読み込み中に戻る\n前提 読み込みの失敗のモック（10-error.html）を開いている',
      )

      await check(page, '読み込みの失敗の文と「読み直す」が出る', () =>
        expect(page.getByTestId('organization-list-error')).toHaveText(
          '部署とチームを読み込めませんでした。時間をおいて、読み直してください。',
        ),
      )

      await step(page, '「読み直す」を押す', () =>
        page.getByTestId('organization-list-retry').click(),
      )
      await check(page, '読み込み中のモック（09-loading.html）へ移る', () =>
        expect(page).toHaveURL(/09-loading\.html/),
      )
    })

    test('organization-forbidden 職員の管理の権限が無い場合、権限が無い表示が出て、ナビゲーションに職員のまとまりが無いこと', async ({
      page,
    }) => {
      await openMock(page, '11-forbidden.html', (p) => p.getByTestId('page-forbidden'))
      await intro(
        page,
        '職員の管理の権限が無いと、権限が無い表示が出て、ナビゲーションに「職員」と「部署とチーム」が出ない\n前提 権限が無いときのモック（11-forbidden.html）を開いている',
      )

      await check(
        page,
        '権限が無い表示が出て、ナビゲーションに「職員」と「部署とチーム」が無い',
        async () => {
          await expect(page.getByTestId('page-forbidden')).toContainText(
            'この画面を開く権限がありません',
          )
          await expect(page.getByTestId('site-nav-staff')).toHaveCount(0)
          await expect(page.getByTestId('site-nav-organization')).toHaveCount(0)
        },
      )

      await step(page, '「予定のカレンダーへ」を押す', () =>
        page.getByTestId('page-forbidden-back').click(),
      )
      await check(page, '予定のカレンダーのモック（01-month.html）へ移る', () =>
        expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/),
      )
    })
  })

  test.describe('スマートフォンの幅（ログインなし、画面仕様書のモック）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('organization-list-phone スマートフォンの幅で部署とチームのモックを開いた場合、行が 1 行に名前と編集を並べ、横にスクロールしないこと', async ({
      page,
    }) => {
      await openMock(page, '01-list.html', departmentNew)
      await intro(
        page,
        'スマートフォンの幅では、どの行も名前と「編集」を 1 行に並べる\n前提 スマートフォンの幅（390x844）で、部署とチームの一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        'チームの行の名前と「編集」が同じ行に並び、横にスクロールしない',
        async () => {
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
        },
      )
    })
  })
})
