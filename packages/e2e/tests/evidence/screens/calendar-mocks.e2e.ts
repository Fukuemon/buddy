import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { mockMain, mockRoot, reviewMockRowParts } from '../../selectors/calendarMocks'

const REVIEW = 'schedule-review_確認が必要な予定/mocks/'
const LINK = 'schedule-link_カレンダーの連携/mocks/'

test.describe('確認が必要な予定とカレンダーの連携の画面仕様書のモック', () => {
  test.describe('パソコンの幅（ログインなし、画面仕様書のモック）', () => {
    test('review-mock-list-desktop パソコンの幅で確認が必要な予定の一覧のモックを開いた場合、行ごとのボタンが無く、理由が 1 文で、? のヘルプが開閉すること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}01-list.html`))
      const row = page.getByTestId('calendar-review-row-schedule-schedule-1')
      // 行の role は interact.js が付ける。付け終えてから、行の中にボタンが無いことを確認する
      await expect(row).toHaveAttribute('role', 'button')
      await intro(
        page,
        '確認が必要な予定の一覧は、行全体を押せる表で行ごとのボタンを置かず、理由は何が起きたかの 1 文にし、初めてのときだけ要る説明は ? のヘルプに入れる\n前提 確認が必要な予定の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '行の右端は「›」だけで、行ごとのボタンが無い。職員の名前は 1 行に収まり、理由は何が起きたかの 1 文だけで、説明も 1 文だけが出ている',
        async () => {
          await expect(reviewMockRowParts(row).buttons).toHaveCount(0)
          await expect(reviewMockRowParts(row).go).toHaveText('›')
          await expect(reviewMockRowParts(row).staff).toHaveCSS('white-space', 'nowrap')
          await expect(page.getByTestId('calendar-review-reason-export-1')).toHaveText(
            'buddy と Google カレンダーの両方で予定が変わりました。',
          )
          await expect(page.getByTestId('schedule-review-help-text')).toBeHidden()
        },
      )

      await step(page, '見出しの右の ? を押す', () =>
        page.getByTestId('schedule-review-help').click(),
      )
      await check(page, '見出しの下に、片方だけで変わった予定は出ないことの説明が出る', () =>
        expect(page.getByTestId('schedule-review-help-text')).toBeVisible(),
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, 'ヘルプの説明が閉じる', () =>
        expect(page.getByTestId('schedule-review-help-text')).toBeHidden(),
      )
    })

    test('review-mock-detail 確認が必要な予定の一覧のモックで行を押した場合、予定と 2 つの選択肢を入れた予定の確認のダイアログが出て、閉じるで一覧に戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}01-list.html`))
      const row = page.getByTestId('calendar-review-row-schedule-schedule-1')
      await expect(row).toBeVisible()
      await intro(
        page,
        '行を押すと、予定の日時、職員、理由、予定を開くと、フッターの左端に赤い文字の「buddy の内容で書き直す」と、右に「閉じる」を入れた、× の無いダイアログが出る\n前提 確認が必要な予定の一覧のモック（01-list.html）を開いている',
      )

      await step(page, '1 行目の予定（2026年11月4日（水） 09:00〜09:29）を押す', () => row.click())
      await check(
        page,
        '予定の確認のダイアログ（05-detail.html）に、予定の日時、職員、最後に変わった日時、理由、予定を開くと、フッターの左端に赤い文字の「buddy の内容で書き直す」と、右に「閉じる」が出て、右上の × と「Google の内容に合わせる」が無い',
        async () => {
          await expect(page).toHaveURL(/05-detail\.html/)
          const dialog = page.getByTestId('calendar-review-dialog')
          await expect(dialog).toBeVisible()
          await expect(page.getByTestId('calendar-review-dialog-datetime')).toHaveText(
            '2026年11月4日（水） 09:00〜09:29',
          )
          await expect(page.getByTestId('calendar-review-open-export-1')).toBeVisible()
          await expect(dialog).not.toContainText('Google の内容に合わせる')
          await expect(page.getByTestId('calendar-review-rewrite-export-1')).toHaveClass(
            /wf-btn--destructive/,
          )
          await expect(page.getByTestId('calendar-review-cancel')).toHaveText('閉じる')
        },
      )

      await step(page, 'フッターの「閉じる」を押す', () =>
        page.getByTestId('calendar-review-cancel').click(),
      )
      await check(page, '一覧のモック（01-list.html）へ戻る', () =>
        expect(page).toHaveURL(/01-list\.html/),
      )
    })

    test('review-mock-rewrite 予定の確認のダイアログのモックで buddy の内容で書き直すを押した場合、赤の確定のボタンの確認のダイアログが出て、戻るで予定の確認に戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}05-detail.html`))
      const rewrite = page.getByTestId('calendar-review-rewrite-export-1')
      await expect(rewrite).toBeVisible()
      await intro(
        page,
        '書き直すの確認のダイアログは、確定の「書き直す」が赤で、「数十秒のうちに」の文が無く、戻るで予定の確認へ戻る\n前提 予定の確認のダイアログのモック（05-detail.html）を開いている',
      )

      await step(page, '「buddy の内容で書き直す」を押す', () => rewrite.click())
      await check(
        page,
        '書き直すダイアログ（06-rewrite.html）の確定の「書き直す」が赤で、注意の文に「数十秒のうちに」が無い',
        async () => {
          await expect(page).toHaveURL(/06-rewrite\.html/)
          await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/wf-btn--danger/)
          await expect(page.getByTestId('calendar-rewrite-notice')).not.toContainText('数十秒')
        },
      )

      await step(page, '「戻る」を押す', () => page.getByTestId('calendar-rewrite-cancel').click())
      await check(page, '予定の確認のダイアログ（05-detail.html）へ戻る', () =>
        expect(page).toHaveURL(/05-detail\.html/),
      )
    })

    test('review-mock-cancelled 確認が必要な予定の一覧のモックで buddy でキャンセルした予定の行を押した場合、書き直すだけを出し、Google の予定を消す確認になること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}01-list.html`))
      const row = page.getByTestId('calendar-review-row-schedule-schedule-4')
      await expect(row).toBeVisible()
      await intro(
        page,
        'キャンセルした予定の行を押すと、書き直すだけを出し、書き直すと Google カレンダーの予定を消すことを確認する\n前提 確認が必要な予定の一覧のモック（01-list.html）を開いている',
      )

      await step(page, '5 行目の、buddy でキャンセルした予定を押す', () => row.click())
      await check(
        page,
        'キャンセルした予定の確認（12-detail-cancelled.html）に、「Google の内容に合わせる」が無く、「buddy の内容で書き直す」だけがある',
        async () => {
          await expect(page).toHaveURL(/12-detail-cancelled\.html/)
          await expect(page.getByTestId('calendar-review-rewrite-export-5')).toBeVisible()
          await expect(page.getByTestId('calendar-review-dialog')).not.toContainText(
            'Google の内容に合わせる',
          )
        },
      )

      await step(page, '「buddy の内容で書き直す」を押す', () =>
        page.getByTestId('calendar-review-rewrite-export-5').click(),
      )
      await check(
        page,
        'Google カレンダーの予定を消すことを示し、確定の「書き直す」が赤である',
        async () => {
          await expect(page).toHaveURL(/13-rewrite-cancelled\.html/)
          await expect(page.getByTestId('calendar-rewrite-notice')).toHaveText(
            'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。',
          )
          await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/wf-btn--danger/)
        },
      )
    })

    test('review-mock-rewrite-error 書き直しの失敗のモックを開いた場合、書き直す待ちの語を使わない文が出ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}08-rewrite-error.html`))
      const error = page.getByTestId('calendar-rewrite-error')
      await expect(error).toBeVisible()
      await intro(
        page,
        '書き直しの失敗の文は、「書き直す待ち」ではなく、職員から見た結果で書く\n前提 書き直しの失敗のモック（08-rewrite-error.html）を開いている',
      )

      await check(
        page,
        '書き直しの失敗のモック（08-rewrite-error.html）に「この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。」が出る',
        () =>
          expect(error).toHaveText(
            'この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。',
          ),
      )
    })

    test('link-mock-list-desktop パソコンの幅でカレンダーの連携の一覧のモックを開いた場合、結び付けていない行は空のセルと結び付けるだけ、結び付けた行は…を置き、サービスアカウントの語が無いこと', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}01-list.html`))
      const rows = page.getByTestId('calendar-link-row-{職員の id}')
      const linked = rows.nth(0)
      const unlinked = rows.nth(1)
      await expect(linked.getByTestId('calendar-link-menu-{職員の id}')).toBeVisible()
      await intro(
        page,
        'カレンダーの連携の一覧は、結び付けていない行に「結び付ける」を 1 つ、結び付けた行に「…」を置き、共有の相手は「共有する相手のメールアドレス」と書く\n前提 カレンダーの連携の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '結び付けた職員 A と C の行の右端は「…」だけで、結び付けていない職員 B と D の行は、カレンダーと最後の取り込みのセルが空で「結び付ける」だけがある。画面に「サービスアカウント」の語が無い',
        async () => {
          await expect(linked.getByTestId('calendar-link-open-{職員の id}')).toHaveCount(0)
          await expect(linked.getByTestId('calendar-link-remove-{職員の id}')).toBeHidden()
          await expect(unlinked.getByTestId('calendar-link-open-{職員の id}')).toHaveText(
            '結び付ける',
          )
          await expect(unlinked.getByTestId('calendar-link-menu-{職員の id}')).toHaveCount(0)
          await expect(unlinked.getByTestId('calendar-link-calendar-id-{職員の id}')).toHaveClass(
            /wf-visually-hidden/,
          )
          await expect(page.getByTestId('calendar-link-guide')).toContainText(
            '共有する相手のメールアドレス',
          )
          await expect(mockMain(page)).not.toContainText('サービスアカウント')
        },
        { position: 'bottom' },
      )
    })

    test('link-mock-row-menu カレンダーの連携の一覧のモックで…を押した場合、取り込むと赤の外すのメニューが出て、外すで確認のダイアログが出ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}01-list.html`))
      const menu = page.getByTestId('calendar-link-menu-{職員の id}').first()
      await expect(menu).toBeVisible()
      await intro(
        page,
        '「…」のメニューに取り込むと外すが並び、外すは赤で最後にある。外すを押すと、同じ予定を二度は取り込まないことを示す確認が出る\n前提 カレンダーの連携の一覧のモック（01-list.html）を開いている',
      )

      const remove = page.getByTestId('calendar-link-remove-{職員の id}').first()
      await step(page, '職員 A の行の「…」を押す', () => menu.click())
      await check(page, 'メニューに「取り込む」と、赤の「外す」がこの順に出る', async () => {
        await expect(page).toHaveURL(/11-menu\.html/)
        await expect(page.getByTestId('calendar-link-import-{職員の id}').first()).toBeVisible()
        await expect(remove).toHaveClass(/wf-menu__item--danger/)
      })

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, 'メニューが閉じ、一覧のモック（01-list.html）へ戻る', () =>
        expect(page).toHaveURL(/01-list\.html/),
      )

      await step(page, 'もう一度「…」を押し、「外す」を押す', async () => {
        await page.getByTestId('calendar-link-menu-{職員の id}').first().click()
        await page.getByTestId('calendar-link-remove-{職員の id}').first().click()
      })
      await check(
        page,
        '外すダイアログ（05-unlink.html）に「結び付け直しても、同じ予定を二度は取り込みません。」が出て、確定の「外す」が赤である',
        async () => {
          await expect(page).toHaveURL(/05-unlink\.html/)
          await expect(page.getByTestId('calendar-unlink-dialog')).toContainText(
            '結び付け直しても、同じ予定を二度は取り込みません。',
          )
          await expect(page.getByTestId('calendar-unlink-submit')).toHaveClass(/wf-btn--danger/)
        },
      )
    })

    test('link-mock-guide カレンダーの連携の一覧のモックで共有の手順の詳しくを押した場合、手順が開閉し、結び付けていない事業所では開いて始まること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}01-list.html`))
      const toggle = page.getByTestId('calendar-link-guide-toggle')
      const steps = page.getByTestId('calendar-link-steps')
      await expect(toggle).toBeVisible()
      await intro(
        page,
        '共有の手順は「詳しく」で開閉し、どの職員も結び付けていない事業所では開いた状態で始まる\n前提 カレンダーの連携の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '結び付けた職員がいる一覧のモック（01-list.html）では、共有の手順が閉じている',
        async () => {
          await expect(toggle).toHaveText('詳しく')
          await expect(steps).toBeHidden()
        },
      )

      await step(page, '「詳しく」を押す', () => toggle.click())
      await check(page, '3 つの共有の手順が開く', () => expect(steps).toBeVisible())

      await step(page, 'もう一度「詳しく」を押す', () => toggle.click())
      await check(page, '共有の手順が閉じる', () => expect(steps).toBeHidden())

      await step(page, '結び付けていない事業所のモック（10-no-links.html）を開く', async () => {
        await page.goto(mockUrl(`${LINK}10-no-links.html`))
      })
      await check(page, '共有の手順が開いた状態で始まる', async () => {
        await expect(steps).toBeVisible()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      })
    })

    test('link-mock-dialog-help 結び付けるダイアログのモックでカレンダーの ID の ? を押した場合、説明が出て、読めないときの文が共有する相手のメールアドレスを指すこと', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}02-link.html`))
      const help = page.getByTestId('schedule-link-calendar-id-help')
      const helpText = page.getByTestId('schedule-link-calendar-id-help-text')
      await expect(help).toBeVisible()
      await intro(
        page,
        'カレンダーの ID の説明は ? のヘルプで出し、読めないときの文は「上に出ている buddy のメールアドレス」を指す\n前提 結び付けるダイアログのモック（02-link.html）を開いている',
      )

      await check(
        page,
        '結び付けるダイアログ（02-link.html）のカレンダーの ID の下に、補足の文が無い',
        () => expect(helpText).toBeHidden(),
      )

      await step(page, 'カレンダーの ID の右の ? を押す', () => help.click())
      await check(page, 'カレンダーの ID がどこにあるかの説明が出る', () =>
        expect(helpText).toBeVisible(),
      )

      await step(page, '読めないときのモック（04-link-unreadable.html）を開く', async () => {
        await page.goto(mockUrl(`${LINK}04-link-unreadable.html`))
      })
      await check(
        page,
        '読めないときの文が、サービスアカウントではなく「上に出ている buddy のメールアドレス」を指す',
        () =>
          expect(page.getByTestId('calendar-link-check-result')).toHaveText(
            'このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているかと、カレンダーの ID が合っているかを確認してください。',
          ),
      )
    })

    test('link-mock-not-configured 準備ができていないときのカレンダーの連携のモックを開いた場合、頼む相手を書いた文が出ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}08-not-configured.html`))
      const notice = page.getByTestId('calendar-link-not-configured')
      await expect(notice).toBeVisible()
      await intro(
        page,
        'Google カレンダーの設定が無い事業所では、サービスアカウントの語を使わずに頼む相手を示す\n前提 準備ができていないときのカレンダーの連携のモック（08-not-configured.html）を開いている',
      )

      await check(
        page,
        '「この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。」が出る',
        () =>
          expect(notice).toHaveText(
            'この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。',
          ),
      )
    })
  })

  test.describe('スマートフォンの幅（ログインなし、画面仕様書のモック）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('review-mock-list-phone スマートフォンの幅で確認が必要な予定の一覧のモックを開いた場合、2 行のリストになり、理由を出さず、横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${REVIEW}01-list.html`))
      const row = page.getByTestId('calendar-review-row-schedule-schedule-1')
      await expect(row).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅の確認が必要な予定の一覧は、1 行目に日時、2 行目に職員と最後に変わった日時を並べ、理由は出さない\n前提 スマートフォンの幅（390x844）で、確認が必要な予定の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '行が 2 行のリストの形になり、理由は出ず、横にスクロールしない',
        async () => {
          await expect(row).toHaveCSS('display', 'flex')
          await expect(page.getByTestId('calendar-review-reason-export-1')).toBeHidden()
          await expect(mockRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })

    test('link-mock-list-phone スマートフォンの幅でカレンダーの連携の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto(mockUrl(`${LINK}01-list.html`))
      const row = page.getByTestId('calendar-link-row-{職員の id}').first()
      await expect(row).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅のカレンダーの連携の一覧は、1 行目に職員と行の操作、2 行目にカレンダーの ID と最後の取り込みを並べる\n前提 スマートフォンの幅（390x844）で、カレンダーの連携の一覧のモック（01-list.html）を開いている',
      )

      await check(
        page,
        '行が 2 行のリストになり、見出しと値を積んだカードにならない。横にスクロールしない',
        async () => {
          await expect(row).toHaveCSS('display', 'flex')
          await expect(mockRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })
  })
})
