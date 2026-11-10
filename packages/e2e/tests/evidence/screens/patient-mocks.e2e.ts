import { type Page, expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { pageRoot } from '../../selectors/page'

const LIST = 'patient-list_利用者の一覧/mocks'
const NEW = 'patient-new_利用者の登録/mocks'
const DETAIL = 'patient-detail_利用者の詳細/mocks'

/** モック file を開き、testid が ready の要素が出るまで待つ。ready は file を開いたことを示す要素にする */
const openMock = async (page: Page, file: string, ready: string) => {
  await page.goto(mockUrl(file))
  await expect(page.getByTestId(ready).first()).toBeVisible()
}

test.describe('利用者の管理の画面仕様書のモック', () => {
  test.describe('パソコンの幅（ログインなし、画面仕様書のモック）', () => {
    test('patient-list 利用者の一覧のモックを開いた場合、利用中の利用者だけが状態のカラム無しで並び、ヘルプが開き、行を押すと詳細へ移ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'patient-list-table')
      await intro(
        page,
        '利用者の一覧は、利用中の利用者だけを、名前、担当の職員、サービス、希望のカラムで並べ、? で説明が開く\n前提 利用者の一覧のモック（01-list.html）を開いている',
      )

      await check(page, '「状態: 利用中」で「3 人」が出て、状態のカラムが無い', async () => {
        await expect(page.getByTestId('patient-list-filter-status')).toHaveText('状態: 利用中')
        await expect(page.getByTestId('patient-list-count')).toHaveText('3 人')
        await expect(page.getByTestId('patient-list-table')).not.toContainText('状態')
      })

      await step(page, '? を押す', () => page.getByTestId('patient-list-help').click())
      await check(page, 'タイトルの下に、利用の終了の利用者の説明が出る', () =>
        expect(page.getByTestId('patient-list-help-text')).toHaveText(
          '利用の終了の利用者は、予定の利用者の候補に出ません。',
        ),
      )

      await step(page, 'Escape キーを押し、見本 一郎 の行を押す', async () => {
        await page.keyboard.press('Escape')
        await page.getByTestId('patient-list-row-{利用者の id}').first().click()
      })
      await check(page, '利用者の詳細のモック（01-detail.html）へ移る', () =>
        expect(page).toHaveURL(/patient-detail_.+\/01-detail\.html/),
      )
    })

    test('patient-list-ended 利用者の一覧のモックで状態の絞り込みを押した場合、利用の終了の利用者と利用の終了にした日が出ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'patient-list-filter-status')
      await intro(
        page,
        '「状態: 利用の終了」では、利用の終了の利用者だけを、利用の終了にした日のカラムを足して出す\n前提 利用者の一覧のモック（01-list.html）を開いている',
      )

      await step(page, '状態の絞り込みで「利用の終了」を選ぶ', () =>
        page.getByTestId('patient-list-filter-status').click(),
      )
      await check(
        page,
        '利用の終了の利用者（02-ended.html）が「2 人」出て、「利用の終了にした日」のカラムに日付が出る',
        async () => {
          await expect(page).toHaveURL(/02-ended\.html/)
          await expect(page.getByTestId('patient-list-count')).toHaveText('2 人')
          await expect(page.getByTestId('patient-list-ended-on-{利用者の id}').first()).toHaveText(
            '2026年8月31日（月）に利用の終了',
          )
        },
      )
    })

    test('patient-list-empty 利用者の一覧で絞り込みに合う利用者がいない場合、利用者が無いことの文が出て、絞り込みを外すで一覧へ戻ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/03-empty.html`, 'patient-list-empty')
      await intro(
        page,
        '絞り込みに合う利用者がいないと 利用者が無いことの文が出て、絞り込みを外すで一覧へ戻る\n前提 絞り込みに合う利用者がいないときのモック（03-empty.html）を開いている',
      )

      await check(
        page,
        '名前の検索の「山田」に合う利用者がいないので、利用者が無いことの文が出る',
        () =>
          expect(page.getByTestId('patient-list-empty')).toContainText(
            '条件に合う利用者はいません。',
          ),
      )

      await step(page, '「絞り込みを外す」を押す', () =>
        page.getByTestId('patient-list-filter-clear').click(),
      )
      await check(page, '一覧（01-list.html）へ戻る', () => expect(page).toHaveURL(/01-list\.html/))
    })

    test('patient-list-loading 利用者の一覧を読んでいる場合、読み込み中の表示が出ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/04-loading.html`, 'patient-list-loading')
      await intro(
        page,
        '利用者を読んでいる間は、一覧の位置に読み込み中の表示が出る\n前提 読み込み中のモック（04-loading.html）を開いている',
      )

      await check(page, '一覧の位置に「読み込んでいます」が出る', () =>
        expect(page.getByTestId('patient-list-loading')).toHaveText('読み込んでいます'),
      )
    })

    test('patient-list-error 利用者の一覧を読めなかった場合、失敗の文が出て、読み直すで一覧へ移ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/05-error.html`, 'patient-list-error')
      await intro(
        page,
        '利用者を読めないと失敗の文が出て、読み直すで一覧へ移る\n前提 読み込みの失敗のモック（05-error.html）を開いている',
      )

      await check(page, '「利用者を読み込めませんでした。」の文が出る', () =>
        expect(page.getByTestId('patient-list-error')).toHaveText(
          '利用者を読み込めませんでした。時間をおいて、読み直してください。',
        ),
      )

      await step(page, '「読み直す」を押す', () => page.getByTestId('patient-list-retry').click())
      await check(page, '一覧（01-list.html）へ移る', () => expect(page).toHaveURL(/01-list\.html/))
    })

    test('patient-list-forbidden 職員の管理の権限を持たない職員が利用者の一覧を開いた場合、権限が無い表示が出て、ナビゲーションに職員と利用者が無いこと', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/06-forbidden.html`, 'page-forbidden')
      await intro(
        page,
        '職員の管理の権限が無いと、権限が無い表示が出て、ナビゲーションに職員と利用者が出ない\n前提 権限が無いときのモック（06-forbidden.html）を開いている',
      )

      await check(
        page,
        '権限が無い表示が出て、ナビゲーションに「職員」と「利用者」が無い',
        async () => {
          await expect(page.getByTestId('page-forbidden')).toContainText(
            'この画面を開く権限がありません',
          )
          await expect(page.getByTestId('site-nav-staff')).toHaveCount(0)
          await expect(page.getByTestId('site-nav-patient')).toHaveCount(0)
        },
      )
    })

    test('patient-new 利用者の一覧で利用者を登録を押した場合、選ぶ欄が未選択で × の無い登録のダイアログが開き、Escape で一覧へ戻ること', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'patient-list-new')
      await intro(
        page,
        '利用者を登録を押すと、選ぶ欄が未選択で × の無い入力のダイアログが開き、Escape で一覧へ戻る\n前提 利用者の一覧のモック（01-list.html）を開いている',
      )

      await step(page, '「利用者を登録」を押す', () => page.getByTestId('patient-list-new').click())
      await check(
        page,
        '登録のダイアログ（01-initial.html）が開き、サービスと担当の職員が「選んでください」で、希望は選んでいない。右上に × が無く、フッターに「キャンセル」がある',
        async () => {
          await expect(page).toHaveURL(/patient-new_.+\/01-initial\.html/)
          await expect(page.getByTestId('patient-new-service')).toHaveText('選んでください')
          await expect(page.getByTestId('patient-new-staff')).toHaveText('選んでください')
          await expect(page.getByTestId('patient-new-cancel')).toHaveText('キャンセル')
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '一覧（01-list.html）へ戻る', () =>
        expect(page).toHaveURL(/patient-list_.+\/01-list\.html/),
      )
    })

    test('patient-new-invalid 登録のダイアログで何も入れずに登録を押した場合、欄ごとの誤りの文が出ること', async ({
      page,
    }) => {
      await openMock(page, `${NEW}/01-initial.html`, 'patient-new-submit')
      await intro(
        page,
        '名前、サービス、希望の時間帯が無いまま登録を押すと、欄ごとに誤りの文が出る\n前提 登録のダイアログのモック（01-initial.html）を開いている',
      )

      await step(page, '「登録」を押す', () => page.getByTestId('patient-new-submit').click())
      await check(
        page,
        '入力の誤り（02-invalid.html）で、名前、サービス、希望の時間帯の下に誤りの文が出る',
        async () => {
          await expect(page).toHaveURL(/02-invalid\.html/)
          await expect(page.getByTestId('patient-new-error-{項目}')).toHaveText([
            '名前を入れてください',
            'サービスを選んでください',
            '希望の時間帯を選んでください',
          ])
        },
      )
    })

    test('patient-new-submit-error 登録を予定の API が拒んだ場合、理由の文が出ること', async ({
      page,
    }) => {
      await openMock(page, `${NEW}/03-submit-error.html`, 'patient-new-submit-error')
      await intro(
        page,
        '選んだ担当の職員が休職か退職になって登録を拒まれると、理由の文が出る\n前提 登録の失敗のモック（03-submit-error.html）を開いている',
      )

      await check(page, '登録の失敗（03-submit-error.html）で、フッターの左に理由の文が出る', () =>
        expect(page.getByTestId('patient-new-submit-error')).toHaveText(
          '選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。',
        ),
      )
    })

    test('patient-detail 利用中の利用者の詳細のモックを開いた場合、状態の印と利用の行が無いこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'patient-detail-name')
      await intro(
        page,
        '利用中の利用者の詳細は、見出しと編集と「…」、プロフィールを出し、状態の印と利用の行を出さない\n前提 利用中の利用者の詳細のモック（01-detail.html）を開いている',
      )

      await check(
        page,
        '詳細（01-detail.html）に、サービス、希望、担当の職員が出て、状態の印と利用の行が無い',
        async () => {
          await expect(page.getByTestId('patient-detail-name')).toHaveText('見本 一郎')
          await expect(page.getByTestId('patient-detail-profile')).toContainText('森 健太')
          await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)
          await expect(page.getByTestId('patient-detail-status-text')).toHaveCount(0)
        },
      )
    })

    test('patient-detail-menu 利用者の詳細のモックで「…」を押した場合、利用を終了するのメニューが開き、Escape で閉じること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'patient-detail-menu')
      await intro(
        page,
        '「…」を押すと利用を終了するのメニューが開き、Escape で閉じる\n前提 利用中の利用者の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, '「…」を押す', () => page.getByTestId('patient-detail-menu').click())
      await check(page, '「…」のメニュー（02-menu.html）に、利用を終了するが出る', async () => {
        await expect(page).toHaveURL(/02-menu\.html/)
        await expect(page.getByTestId('patient-detail-end')).toHaveText('利用を終了する')
      })

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, 'メニューが閉じ、詳細（01-detail.html）へ戻る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })

    test('patient-detail-edit 利用者の詳細のモックで編集を押した場合、利用者の編集のダイアログが開き、キャンセルで戻ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/01-detail.html`, 'patient-detail-edit')
      await intro(
        page,
        '編集を押すと利用者の編集のダイアログが開き、フッターのキャンセルで詳細へ戻る\n前提 利用中の利用者の詳細のモック（01-detail.html）を開いている',
      )

      await step(page, '「編集」を押す', () => page.getByTestId('patient-detail-edit').click())
      await check(
        page,
        '利用者の編集のダイアログ（03-edit.html）に、名前、サービス、希望、担当の職員の欄と、担当の職員の注意が出る',
        async () => {
          await expect(page).toHaveURL(/03-edit\.html/)
          await expect(page.getByTestId('patient-detail-edit-dialog')).toContainText(
            '休職と退職の職員と、訪問しない職員は新しく選べず、今の担当のままなら保存できます。',
          )
        },
      )

      await step(page, 'フッターの「キャンセル」を押す', () =>
        page.getByTestId('patient-detail-edit-cancel').click(),
      )
      await check(page, '詳細（01-detail.html）へ戻る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })

    test('patient-detail-end 残る予定が無い利用者の利用を終了した場合、利用の終了の利用者になること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/04-end.html`, 'patient-end-schedules')
      await intro(
        page,
        '残る予定が無ければ、確認のダイアログで利用を終了でき、利用の終了の利用者になる\n前提 利用の終了の確認のモック（04-end.html）を開いている',
      )

      await check(
        page,
        '利用の終了の確認（04-end.html）に、戻せることと「今日以降の予定は残っていません。」が出る',
        () =>
          expect(page.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          ),
      )

      await step(page, '「利用を終了する」を押す', () =>
        page.getByTestId('patient-end-submit').click(),
      )
      await check(page, '利用の終了の利用者（06-ended.html）へ移る', () =>
        expect(page).toHaveURL(/06-ended\.html/),
      )
    })

    test('patient-detail-end-refused 予定が残る利用者の利用を終了しようとした場合、残る予定が出て、利用を終了するが押せないこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/02-menu.html`, 'patient-detail-end')
      await intro(
        page,
        '予定が残る利用者では、残る予定と繰り返しの予定が出て、利用を終了するが押せない\n前提 利用者の詳細の「…」のメニューのモック（02-menu.html）を開いている',
      )

      await step(page, '「…」のメニューの「利用を終了する」を押す', () =>
        page.getByTestId('patient-detail-end').click(),
      )
      await check(
        page,
        '利用の終了を拒む（05-end-refused.html）に、予定 2 件と繰り返しの予定 1 件が出て、「利用を終了する」が押せない',
        async () => {
          await expect(page).toHaveURL(/05-end-refused\.html/)
          await expect(page.getByTestId('patient-end-schedule-{予定の id}')).toHaveCount(2)
          await expect(page.getByTestId('patient-end-recurring-{繰り返しの予定の id}')).toHaveCount(
            1,
          )
          await expect(page.getByTestId('patient-end-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
    })

    test('patient-detail-ended 利用の終了の利用者の詳細のモックを開いた場合、印と予定の利用者に選べないことが出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/06-ended.html`, 'patient-detail-status')
      await intro(
        page,
        '利用の終了の利用者の詳細は、利用の終了の印と、予定の利用者に選べないことを出す\n前提 利用の終了の利用者の詳細のモック（06-ended.html）を開いている',
      )

      await check(
        page,
        '利用の終了の利用者（06-ended.html）に、「利用の終了（2026年9月30日（水））」と「利用: 予定の利用者に選べません。」が出る',
        async () => {
          await expect(page.getByTestId('patient-detail-status')).toHaveText(
            '利用の終了（2026年9月30日（水））',
          )
          await expect(page.getByTestId('patient-detail-status-text')).toHaveText(
            '予定の利用者に選べません。',
          )
        },
      )
    })

    test('patient-detail-ended-menu 利用の終了の利用者の詳細で「…」を押した場合、利用を再開するのメニューが開くこと', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/06-ended.html`, 'patient-detail-menu')
      await intro(
        page,
        '利用の終了の利用者の「…」には、利用を再開するが出る\n前提 利用の終了の利用者の詳細のモック（06-ended.html）を開いている',
      )

      await step(page, '「…」を押す', () => page.getByTestId('patient-detail-menu').click())
      await check(
        page,
        '「…」のメニュー（07-ended-menu.html）に、利用を再開するが出る',
        async () => {
          await expect(page).toHaveURL(/07-ended-menu\.html/)
          await expect(page.getByTestId('patient-detail-resume')).toHaveText('利用を再開する')
        },
      )
    })

    test('patient-detail-resume 担当の職員が退職した利用者の利用を再開した場合、担当を選び直して詳細へ戻ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/07-ended-menu.html`, 'patient-detail-resume')
      await intro(
        page,
        '利用の再開では、今の担当の職員が退職していることが出て、選び直した担当で利用中に戻る\n前提 利用の終了の利用者の「…」のメニューのモック（07-ended-menu.html）を開いている',
      )

      await step(page, '「利用を再開する」を押す', () =>
        page.getByTestId('patient-detail-resume').click(),
      )
      await check(
        page,
        '利用の再開のダイアログ（11-resume-unselected.html）に、今の担当が退職している注意と、担当の職員の欄が出て、選ぶまで「利用を再開する」を押せない',
        async () => {
          await expect(page).toHaveURL(/11-resume-unselected\.html/)
          await expect(page.getByTestId('patient-resume-staff-note')).toHaveText(
            '今の担当の 西村 学 は退職しています。担当の職員を選んでください。',
          )
          await expect(page.getByTestId('patient-resume-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )

      await step(page, '担当の職員の欄で「林 さくら」を選ぶ', () =>
        page.getByTestId('patient-resume-staff').click(),
      )
      await check(
        page,
        '担当を選んだダイアログ（08-resume.html）で、担当の職員の欄に「林 さくら」が出る',
        async () => {
          await expect(page).toHaveURL(/08-resume\.html/)
          await expect(page.getByTestId('patient-resume-staff')).toHaveText('林 さくら')
        },
      )

      await step(page, '「利用を再開する」を押す', () =>
        page.getByTestId('patient-resume-submit').click(),
      )
      await check(page, '利用中の利用者の詳細（01-detail.html）へ移る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })

    test('patient-detail-loading 利用者の詳細を読んでいる場合、読み込み中の表示が出ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/09-loading.html`, 'patient-detail-loading')
      await intro(
        page,
        '利用者を読んでいる間は、読み込み中の表示が出る\n前提 読み込み中のモック（09-loading.html）を開いている',
      )

      await check(page, '「読み込んでいます」が出る', () =>
        expect(page.getByTestId('patient-detail-loading')).toHaveText('読み込んでいます'),
      )
    })

    test('patient-detail-error 利用者の詳細を読めなかった場合、失敗の文が出て、読み直すで詳細へ移ること', async ({
      page,
    }) => {
      await openMock(page, `${DETAIL}/10-error.html`, 'patient-detail-error')
      await intro(
        page,
        '利用者を読めないと失敗の文が出て、読み直すで詳細へ移る\n前提 読み込みの失敗のモック（10-error.html）を開いている',
      )

      await check(page, '「利用者を読み込めませんでした。」の文が出る', () =>
        expect(page.getByTestId('patient-detail-error')).toHaveText(
          '利用者を読み込めませんでした。時間をおいて、読み直してください。',
        ),
      )

      await step(page, '「読み直す」を押す', () => page.getByTestId('patient-detail-retry').click())
      await check(page, '詳細（01-detail.html）へ移る', () =>
        expect(page).toHaveURL(/01-detail\.html/),
      )
    })
  })

  test.describe('スマートフォンの幅（ログインなし、画面仕様書のモック）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('patient-list-phone スマートフォンの幅で利用者の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと', async ({
      page,
    }) => {
      await openMock(page, `${LIST}/01-list.html`, 'patient-list-row-{利用者の id}')
      await intro(
        page,
        'スマートフォンの幅の利用者の一覧は、1 行目に名前、2 行目に担当の職員、サービス、希望を置く\n前提 スマートフォンの幅（390x844）で、利用者の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '行が 2 行のリストになり、2 行目に担当の職員、サービス、希望が「・」でつながり、横にスクロールしない',
        async () => {
          await expect(page.getByTestId('patient-list-row-{利用者の id}').first()).toHaveCSS(
            'display',
            'flex',
          )
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })
  })
})
