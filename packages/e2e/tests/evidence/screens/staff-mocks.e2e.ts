import { type Page, expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { pageRoot } from '../../selectors/page'

const LIST = 'staff-list_職員の一覧/mocks'
const NEW = 'staff-new_職員の登録/mocks'
const DETAIL = 'staff-detail_職員の詳細/mocks'

/** モック file を開き、testid が ready の要素が出るまで待つ。ready は file を開いたことを示す要素にする */
const openMock = async (page: Page, file: string, ready: string) => {
  await page.goto(mockUrl(file))
  await expect(page.getByTestId(ready).first()).toBeVisible()
}

test.describe('職員の管理の画面仕様書のモック', () => {
  test.describe('パソコンの幅（ログインなし、画面仕様書のモック）', () => {
    test('staff-list-desktop パソコンの幅で職員の一覧のモックを開いた場合、有効の職員だけがチームの順に並び、状態のカラムが無く、行を押すと職員の詳細へ移ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'staff-list-table')
      await intro(
        page,
        '職員の一覧は、有効の職員だけを、名前、チーム、役職、部署のカラムでチームの順に並べ、チームの名前の前に色の点を置く\n前提 職員の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '「状態: 有効」で「5 人」が出て、状態のカラムが無く、東、西、南のチームの順に、色の点とチームの名前が並ぶ',
        async () => {
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 有効')
          await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
          await expect(page.getByTestId('staff-list-table')).not.toContainText('状態')
          await expect(page.getByTestId('staff-list-row-{職員の id}').first()).toContainText(
            '東チーム',
          )
          await expect(page.getByTestId('staff-list-row-{職員の id}').last()).toContainText(
            '南チーム',
          )
        },
      )

      await step(page, '林 さくら の行を押す', () =>
        page.getByTestId('staff-list-row-{職員の id}').nth(1).click(),
      )
      await check(page, '職員の詳細のモック（01-detail.html）へ移る', () =>
        expect(page).toHaveURL(/staff-detail_.+\/01-detail\.html/),
      )
    })

    test('staff-list-on-leave 職員の一覧のモックで状態の絞り込みを押した場合、休職の職員と戻る予定の日が出るモックへ移ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LIST}/01-list.html`))
      await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
      await intro(
        page,
        '状態の絞り込みを「休職」にすると、休職の職員だけが出て、「戻る予定の日」のカラムを足す\n前提 職員の一覧のモック（01-list.html）を開いている。有効の職員が 5 人出ている',
      )

      await step(page, '状態の絞り込みを押す', () =>
        page.getByTestId('staff-list-filter-status').click(),
      )
      await check(
        page,
        '「休職の職員」のモック（02-on-leave.html）へ移り、休職の「2 人」と、「戻る予定の日」のカラムが出る',
        async () => {
          await expect(page).toHaveURL(/02-on-leave\.html/)
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 休職')
          await expect(page.getByTestId('staff-list-count')).toHaveText('2 人')
          await expect(page.getByTestId('staff-list-leave-return-{職員の id}')).toHaveText([
            '戻る予定の日なし',
            '2027年4月1日（木）に戻る予定',
          ])
        },
      )
    })

    test('staff-list-retired 休職の職員のモックで状態の絞り込みを押した場合、退職の職員と退職した日が出るモックへ移ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LIST}/02-on-leave.html`))
      await expect(page.getByTestId('staff-list-count')).toHaveText('2 人')
      await intro(
        page,
        '状態の絞り込みを「退職」にすると、退職の職員だけが出て、「退職した日」のカラムを足す\n前提 休職の職員のモック（02-on-leave.html）を開いている。休職の職員が 2 人出ている',
      )

      await step(page, '状態の絞り込みを押す', () =>
        page.getByTestId('staff-list-filter-status').click(),
      )
      await check(
        page,
        '「退職の職員」のモック（03-retired.html）へ移り、退職の「1 人」と、「退職した日」のカラムが出る',
        async () => {
          await expect(page).toHaveURL(/03-retired\.html/)
          await expect(page.getByTestId('staff-list-filter-status')).toHaveText('状態: 退職')
          await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
          await expect(page.getByTestId('staff-list-retired-on-{職員の id}')).toHaveText(
            '2026年9月30日（水）に退職',
          )
        },
      )
    })

    test('staff-list-empty 職員の一覧で絞り込みに合う職員がいない場合、職員が無いことの文が出て、絞り込みを外すで一覧へ戻ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/04-empty.html`, 'staff-list-empty')
      await intro(
        page,
        '絞り込みで 0 件のときは知らせを出し、「絞り込みを外す」で一覧に戻る\n前提 絞り込みで 0 件のモック（04-empty.html）を開いている',
      )

      await check(
        page,
        '「絞り込みで 0 件」のモック（04-empty.html）に、職員が無いことの文と「絞り込みを外す」が出る',
        async () => {
          await expect(page.getByTestId('staff-list-empty')).toContainText(
            '条件に合う職員はいません。',
          )
          await expect(page.getByTestId('staff-list-count')).toHaveText('0 人')
        },
      )

      await step(page, '「絞り込みを外す」を押す', () =>
        page.getByTestId('staff-list-filter-clear').click(),
      )
      await check(page, '一覧のモック（01-list.html）へ戻る', async () => {
        await expect(page).toHaveURL(/01-list\.html/)
        await expect(page.getByTestId('staff-list-count')).toHaveText('5 人')
      })
    })

    test('staff-list-help 職員の一覧のモックでヘルプを押した場合、休職と退職の職員の説明が出ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'staff-list-help')
      await expect(page.getByTestId('staff-list-help-text')).toBeHidden()
      await intro(
        page,
        '? を押すと、休職と退職の職員の扱いの説明が出る\n前提 職員の一覧のモック（01-list.html）を開いている。説明は閉じている',
      )

      await step(page, 'ページのタイトルの右の ? を押す', () =>
        page.getByTestId('staff-list-help').click(),
      )
      await check(page, 'ページのタイトルの下に、休職と退職の職員の説明が出る', () =>
        expect(page.getByTestId('staff-list-help-text')).toHaveText(
          '休職と退職の職員は、ログインできず、予定の担当の候補に出ません。',
        ),
      )
    })

    test('staff-new-dialog 職員の登録のモックを開いた場合、入力のダイアログの形で出て、Escape で一覧へ戻ること', async ({
      page,
    }) => {
      await openMock(page, `${NEW}/01-initial.html`, 'staff-new-dialog')
      await intro(
        page,
        '職員の登録は、× を置かず、? をタイトルの右に、キャンセルと登録をフッターの右に置く\n前提 職員の登録のモック（01-initial.html）を開いている',
      )

      await check(
        page,
        '入力のダイアログに、?、キャンセル、登録が出て、右上に × が無い',
        async () => {
          await expect(page.getByTestId('staff-new-dialog')).toBeVisible()
          await expect(page.getByTestId('staff-new-cancel')).toHaveText('キャンセル')
        },
      )

      await step(page, '? を押す', () => page.getByTestId('staff-new-help').click())
      await check(page, 'タイトルの下に、いつから使えるかの説明が出る', () =>
        expect(page.getByTestId('staff-new-help-text')).toBeVisible(),
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '先に開いた説明が閉じ、ダイアログは開いたまま残る', async () => {
        await expect(page.getByTestId('staff-new-help-text')).toBeHidden()
        await expect(page.getByTestId('staff-new-dialog')).toBeVisible()
      })

      await step(page, 'もう一度 Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '職員の一覧のモック（01-list.html）へ戻る', () =>
        expect(page).toHaveURL(/staff-list_.+\/01-list\.html/),
      )
    })

    test('staff-detail-profile 有効な職員の詳細のモックを開いた場合、状態の印と在籍の行が出ないこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'staff-detail-position-name')
      await intro(
        page,
        '有効な職員のプロフィールには、状態の印と在籍の行を出さない\n前提 有効な職員の詳細のモック（01-detail.html）を開いている',
      )

      await check(page, 'プロフィール（01-detail.html）に、状態の印と在籍の行が無い', async () => {
        await expect(page.getByTestId('staff-detail-position-name')).toHaveText('メンバー')
        await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
        await expect(page.getByTestId('staff-detail-status-text')).toHaveCount(0)
      })
    })

    test('staff-detail-policies 職員の詳細のモックで権限のタブを押した場合、付いている権限だけが付いた理由のまとまりで並ぶこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'staff-detail-tab-policies')
      await intro(
        page,
        '権限のタブは、付いている権限だけを、役職で付く権限と個別に足した権限のまとまりに分けて並べる\n前提 有効な職員の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, 'タブの「権限」を押す', () =>
        page.getByTestId('staff-detail-tab-policies').click(),
      )
      await check(
        page,
        '権限のタブ（02-policies.html）に、付いている 2 つの権限がまとまりごとに並び、対象は 2 行目にだけ出る',
        async () => {
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
        },
      )
    })

    test('staff-detail-menu 職員の詳細のモックで「…」を押した場合、休職にすると赤の退職にするのメニューが開き、Escape で閉じること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'staff-detail-menu')
      await intro(
        page,
        '「…」を押すと、休職にすると退職にするのメニューが開き、Escape で閉じる\n前提 有効な職員の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, '「…」を押す', () => page.getByTestId('staff-detail-menu').click())
      await check(
        page,
        '「…」のメニュー（03-menu.html）に、休職にすると、赤の退職にするが出る',
        async () => {
          await expect(page).toHaveURL(/03-menu\.html/)
          await expect(page.getByTestId('staff-detail-leave')).toBeVisible()
          await expect(page.getByTestId('staff-detail-retire')).toHaveClass(/wf-menu__item--danger/)
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, 'メニューが閉じ、プロフィール（01-detail.html）へ戻る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })

    test('staff-detail-edit 職員の詳細のモックで編集を押した場合、プロフィールの編集のダイアログが開き、キャンセルで戻ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'staff-detail-edit')
      await intro(
        page,
        '編集を押すとプロフィールの編集のダイアログが開き、フッターのキャンセルで閉じる\n前提 有効な職員の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, '「編集」を押す', () => page.getByTestId('staff-detail-edit').click())
      await check(
        page,
        'プロフィールの編集のダイアログ（04-edit.html）に、名前、メールアドレス、電話番号、部署、チームが出る',
        async () => {
          await expect(page).toHaveURL(/04-edit\.html/)
          await expect(page.getByTestId('staff-detail-team-input')).toHaveText('西チーム')
        },
      )

      await step(page, 'フッターの「キャンセル」を押す', () =>
        page.getByTestId('staff-detail-edit-cancel').click(),
      )
      await check(page, 'プロフィール（01-detail.html）へ戻る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })

    test('staff-detail-position 職員の詳細のモックで役職を変えるを押した場合、個別に足した権限が残る注意と赤のボタンが出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'staff-detail-position-change')
      await intro(
        page,
        '役職を変えるダイアログに、個別に足した権限が残る注意と赤の「役職を変える」が出る\n前提 有効な職員の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, '「役職を変える」を押す', () =>
        page.getByTestId('staff-detail-position-change').click(),
      )
      await check(
        page,
        '役職を変えるダイアログ（19-position-open.html）に、残る権限の注意と、今の役職を選んだままでは押せない赤の「役職を変える」が出る',
        async () => {
          await expect(page).toHaveURL(/19-position-open\.html/)
          await expect(page.getByTestId('staff-position-note')).toContainText(
            '個別に足した権限（指定した職員の予定の閲覧）は残ります。',
          )
          await expect(page.getByTestId('staff-position-submit')).toHaveClass(/wf-btn--danger/)
          await expect(page.getByTestId('staff-position-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )

      await step(page, '「チームリーダー」を選ぶ', () =>
        page
          .getByTestId('staff-position-option-{役職の id}')
          .filter({ hasText: 'チームリーダー' })
          .click(),
      )
      await check(
        page,
        '役職を選んだダイアログ（05-position.html）で、赤の「役職を変える」を押せるようになる',
        async () => {
          await expect(page).toHaveURL(/05-position\.html/)
          await expect(page.getByTestId('staff-position-submit')).toHaveClass(/wf-btn--danger/)
          await expect(page.getByTestId('staff-position-submit')).not.toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
    })

    test('staff-detail-policies-dialog 職員の詳細のモックで権限を変えるを押した場合、まとまりごとのチェックボックスと選んだ対象のチップが出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/02-policies.html`, 'staff-detail-policies-change')
      await intro(
        page,
        '権限を変えるダイアログは、役職で付く権限とほかの権限のまとまりにチェックボックスを並べ、対象は選んだものだけをチップで出す\n前提 職員の詳細の権限のタブのモック（02-policies.html）を開いている',
      )

      await step(page, '「権限を変える」を押す', () =>
        page.getByTestId('staff-detail-policies-change').click(),
      )
      await check(
        page,
        '権限を変えるダイアログ（06-policies.html）に、2 つのまとまりと 9 つのチェックボックス、選んだ 2 人のチップと「＋ 職員を選ぶ」が出る',
        async () => {
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
        },
      )

      const options = page.getByTestId('staff-policies-option-{権限の code}')
      await step(page, '「指定した職員の予定の編集」にチェックを付ける', () =>
        options.nth(2).click(),
      )
      await check(page, 'ほかの権限のチェックを付けられる', () =>
        expect(options.nth(2)).toHaveAttribute('aria-checked', 'true'),
      )
    })

    test('staff-detail-policies-target 権限を変えるダイアログで対象を足すを押した場合、選んでいない職員の候補が開き、Escape で閉じること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/06-policies.html`, 'staff-policies-target-add')
      await intro(
        page,
        '「＋ 職員を選ぶ」を押すと、選んでいない職員の候補が開き、Escape で候補だけを閉じる\n前提 権限を変えるダイアログのモック（06-policies.html）を開いている',
      )

      await step(page, '「＋ 職員を選ぶ」を押す', () =>
        page.getByTestId('staff-policies-target-add').click(),
      )
      await check(
        page,
        '対象を足す（16-policies-target.html）に、選んでいない 3 人の候補が出る',
        async () => {
          await expect(page).toHaveURL(/16-policies-target\.html/)
          await expect(page.getByTestId('staff-policies-target-option-{職員の id}')).toHaveCount(3)
          await expect(page.getByTestId('staff-policies-target-add')).toHaveAttribute(
            'aria-expanded',
            'true',
          )
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(
        page,
        '候補だけが閉じ、権限を変えるダイアログ（06-policies.html）は開いたまま',
        async () => {
          await expect(page).toHaveURL(/06-policies\.html/)
          await expect(page.getByTestId('staff-policies-dialog')).toBeVisible()
        },
      )
    })

    test('staff-detail-policies-error 権限の保存の一部が拒まれた場合、外せなかった権限にチェックが残り、理由が出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/07-policies-error.html`, 'staff-policies-error')
      await intro(
        page,
        '権限の保存の一部が拒まれると、ダイアログを閉じずに、読み直した権限で選択を出し、変えられなかった権限と理由を出す\n前提 権限の保存の一部の失敗のモック（07-policies-error.html）を開いている',
      )

      await check(
        page,
        '権限の保存の一部の失敗（07-policies-error.html）に、チェックが残った職員の管理と、変えられなかった理由が出る',
        async () => {
          await expect(page.getByTestId('staff-policies-error')).toContainText(
            '職員の管理: 職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
          )
          await expect(
            page
              .getByTestId('staff-policies-option-{権限の code}')
              .filter({ hasText: '職員の管理' }),
          ).toHaveAttribute('aria-checked', 'true')
        },
      )
    })

    test('staff-detail-leave 休職の確認で休職にした場合、休職の職員になり、「…」に復職にするが出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/03-menu.html`, 'staff-detail-leave')
      await intro(
        page,
        '休職の確認から休職にすると休職の職員になり、「…」のメニューに復職にするが出る\n前提 職員の詳細の「…」のメニューのモック（03-menu.html）を開いている',
      )

      await step(page, '「休職にする」を押す', () => page.getByTestId('staff-detail-leave').click())
      await check(
        page,
        '休職の確認（08-leave.html）に、残る予定と担当の利用者と、青の「休職にする」が出る',
        async () => {
          await expect(page).toHaveURL(/08-leave\.html/)
          await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
          await expect(page.getByTestId('staff-leave-submit')).toHaveClass(/wf-btn--primary/)
        },
      )

      await step(page, '「休職にする」を押す', () => page.getByTestId('staff-leave-submit').click())
      await check(page, '休職の職員（09-on-leave.html）になる', async () => {
        await expect(page).toHaveURL(/09-on-leave\.html/)
        await expect(page.getByTestId('staff-detail-status')).toHaveText(
          '休職（2027年4月1日（木）に戻る予定）',
        )
      })

      await step(page, '「…」を押す', () => page.getByTestId('staff-detail-menu').click())
      await check(
        page,
        '「…」のメニュー（10-on-leave-menu.html）に、復職にすると退職にするが出る',
        () => expect(page.getByTestId('staff-detail-reinstate')).toBeVisible(),
      )
    })

    test('staff-detail-reinstate 休職の職員の「…」で復職にした場合、有効の職員に戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${DETAIL}/10-on-leave-menu.html`))
      await expect(page.getByTestId('staff-detail-status')).toHaveText(
        '休職（2027年4月1日（木）に戻る予定）',
      )
      await intro(
        page,
        '休職の職員の「…」のメニューで復職にすると、有効の職員に戻る\n前提 休職の職員の「…」のメニューのモック（10-on-leave-menu.html）を開いている',
      )

      await step(page, '「復職にする」を押す', () =>
        page.getByTestId('staff-detail-reinstate').click(),
      )
      await check(
        page,
        '有効の職員のプロフィール（01-detail.html）に戻り、状態の印が消える',
        async () => {
          await expect(page).toHaveURL(/01-detail\.html/)
          await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
        },
      )
    })

    test('staff-detail-on-leave 休職の職員の詳細のモックを開いた場合、在籍の行に状態の印に書けないことだけが出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/09-on-leave.html`, 'staff-detail-status')
      await intro(
        page,
        '休職の職員の在籍の行は、休職の開始日と、戻る予定の日に自動では戻らないことだけを書く\n前提 休職の職員の詳細のモック（09-on-leave.html）を開いている',
      )

      await check(
        page,
        '休職の職員（09-on-leave.html）の在籍の行が、戻る予定の日を繰り返さない',
        async () => {
          await expect(page.getByTestId('staff-detail-status')).toHaveText(
            '休職（2027年4月1日（木）に戻る予定）',
          )
          await expect(page.getByTestId('staff-detail-status-text')).toHaveText(
            '2026年10月31日（土）から休職です。戻る予定の日に自動では戻りません。',
          )
        },
      )
    })

    test('staff-detail-retired 退職した職員の詳細のモックを開いた場合、メールアドレスと電話番号の行が出ず、消したことを在籍の 1 文に書くこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/13-retired.html`, 'staff-detail-status-text')
      await intro(
        page,
        '退職した職員は、メールアドレスと電話番号を空で出さず、消したことを在籍に 1 回だけ書く\n前提 退職した職員の詳細のモック（13-retired.html）を開いている',
      )

      await check(
        page,
        '退職した職員（13-retired.html）に、メールアドレスと電話番号の行が無く、在籍に消したことが出る',
        async () => {
          await expect(page.getByTestId('staff-detail-email')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-phone')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-status-text')).toContainText(
            'メールアドレスと電話番号は退職で消し',
          )
        },
      )
    })

    test('staff-detail-retire 退職の確認で退職にした場合、退職した職員になり、編集と「…」が出ないこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/03-menu.html`, 'staff-detail-retire')
      await intro(
        page,
        '退職の確認の赤の「退職にする」を押すと、退職した職員になり、編集と「…」が無くなる\n前提 職員の詳細の「…」のメニューのモック（03-menu.html）を開いている',
      )

      await step(page, '「退職にする」を押す', () =>
        page.getByTestId('staff-detail-retire').click(),
      )
      await check(
        page,
        '退職の確認（11-retire.html）に、退職の注意と赤の「退職にする」が出る',
        async () => {
          await expect(page).toHaveURL(/11-retire\.html/)
          await expect(page.getByTestId('staff-retire-submit')).toHaveClass(/wf-btn--danger/)
        },
      )

      await step(page, '「退職にする」を押す', () =>
        page.getByTestId('staff-retire-submit').click(),
      )
      await check(page, '退職した職員（13-retired.html）になり、編集と「…」が出ない', async () => {
        await expect(page).toHaveURL(/13-retired\.html/)
        await expect(page.getByTestId('staff-detail-status')).toHaveText(
          '退職（2026年9月30日（水））',
        )
        await expect(page.getByTestId('staff-detail-edit')).toHaveCount(0)
        await expect(page.getByTestId('staff-detail-menu')).toHaveCount(0)
      })
    })

    test('staff-detail-retire-refused 予定が残る職員を退職にしようとした場合、退職にするが押せないこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/12-retire-refused.html`, 'staff-retire-assignments')
      await intro(
        page,
        '予定か担当の利用者が残る職員の退職のダイアログでは、退職にするが押せない\n前提 退職を拒むモック（12-retire-refused.html）を開いている',
      )

      await check(
        page,
        '退職を拒む（12-retire-refused.html）に、残る予定と担当の利用者が出て、「退職にする」が押せない',
        async () => {
          await expect(page.getByTestId('staff-retire-assignments')).toBeVisible()
          await expect(page.getByTestId('staff-retire-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
    })
  })

  test.describe('スマートフォンの幅（ログインなし、画面仕様書のモック）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('staff-mocks-list-phone スマートフォンの幅で職員の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'staff-list-row-{職員の id}')
      await intro(
        page,
        'スマートフォンの幅の職員の一覧は、1 行目に名前、2 行目にチームの色の点とチーム、役職、部署を置く\n前提 スマートフォンの幅（390x844）で、職員の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '行が 2 行のリストになり、2 行目の先頭にチームの色の点とチームの名前が出て、横にスクロールしない',
        async () => {
          await expect(page.getByTestId('staff-list-row-{職員の id}').first()).toHaveCSS(
            'display',
            'flex',
          )
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })

    test('staff-detail-policies-phone スマートフォンの幅で職員の詳細の権限のタブを開いた場合、パソコンの幅と同じ形で横にスクロールしないこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/02-policies.html`, 'staff-policy-row-{権限の code}')
      await intro(
        page,
        'スマートフォンの幅の権限の一覧は、パソコンの幅と同じまとまりと 2 行の形で出す\n前提 スマートフォンの幅（390x844）で、職員の詳細の権限のタブのモック（02-policies.html）を開いている',
      )

      await check(
        page,
        '権限の一覧がまとまりと 2 行の形のまま出て、横にスクロールしない',
        async () => {
          await expect(page.getByTestId('staff-policy-targets-{権限の code}')).toBeVisible()
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })
  })
})
