import { expect, test } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  mockUrl,
  recordPrEvidence,
} from '../../fixtures/evidence'
import { mockMain, mockRoot, reviewMockRowParts } from '../../selectors/calendarMocks'

const REVIEW = 'schedule-review_確認が必要な予定/mocks/'
const LINK = 'schedule-link_カレンダーの連携/mocks/'

test.describe('確認が必要な予定とカレンダーの連携の画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}パソコンの幅で確認が必要な予定の一覧のモックを開いた場合、行ごとのボタンが無く、理由が 1 文で、? のヘルプが開閉すること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-list-desktop',
          title:
            '確認が必要な予定の一覧は、行全体を押せる表で行ごとのボタンを置かず、理由は何が起きたかの 1 文にし、初めてのときだけ要る説明は ? のヘルプに入れる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
          const row = page.getByTestId('calendar-review-row-schedule-schedule-1')
          // 行の role は interact.js が付ける。付け終えてから、行の中にボタンが無いことを確認する
          await expect(row).toHaveAttribute('role', 'button')
          await expect(reviewMockRowParts(row).buttons).toHaveCount(0)
          await expect(reviewMockRowParts(row).go).toHaveText('›')
          await expect(reviewMockRowParts(row).staff).toHaveCSS('white-space', 'nowrap')
          await expect(page.getByTestId('calendar-review-reason-export-1')).toHaveText(
            'buddy と Google カレンダーの両方で予定が変わりました。',
          )
          await expect(page.getByTestId('schedule-review-help-text')).toBeHidden()
          await check(
            '行の右端は「›」だけで、行ごとのボタンが無い。職員の名前は 1 行に収まり、理由は何が起きたかの 1 文だけで、説明も 1 文だけが出ている',
          )

          await step('見出しの右の ? を押す')
          await page.getByTestId('schedule-review-help').click()
          await expect(page.getByTestId('schedule-review-help-text')).toBeVisible()
          await check('見出しの下に、片方だけで変わった予定は出ないことの説明が出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('schedule-review-help-text')).toBeHidden()
          await check('ヘルプの説明が閉じる')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で確認が必要な予定の一覧のモックを開いた場合、2 行のリストになり、理由を出さず、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-list-phone',
          title:
            'スマートフォンの幅の確認が必要な予定の一覧は、1 行目に日時、2 行目に職員と最後に変わった日時を並べ、理由は出さない',
          actor: 'ログインなし',
          variant,
          viewport: PHONE_VIEWPORT,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
          const row = page.getByTestId('calendar-review-row-schedule-schedule-1')
          await expect(row).toHaveCSS('display', 'flex')
          await expect(page.getByTestId('calendar-review-reason-export-1')).toBeHidden()
          await expect(mockRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check('行が 2 行のリストの形になり、理由は出ず、横にスクロールしない')
        },
      )
    })

    test(`${prefix}確認が必要な予定の一覧のモックで行を押した場合、予定と 2 つの選択肢を入れた予定の確認のダイアログが出て、× で一覧に戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-detail',
          title:
            '行を押すと、予定の日時、職員、理由、予定を開くと、主ボタンの色でない「buddy の内容で書き直す」を入れたダイアログが出る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
          await step('1 行目の予定（2026/11/04（水）09:00〜09:29）を押す')
          await page.getByTestId('calendar-review-row-schedule-schedule-1').click()
          await expect(page).toHaveURL(/05-detail\.html/)
          const dialog = page.getByTestId('calendar-review-dialog')
          await expect(dialog).toBeVisible()
          await expect(page.getByTestId('calendar-review-dialog-datetime')).toHaveText(
            '2026/11/04（水）09:00〜09:29',
          )
          await expect(page.getByTestId('calendar-review-open-export-1')).toBeVisible()
          await expect(page.getByTestId('calendar-review-dialog')).not.toContainText(
            'Google の内容に合わせる',
          )
          await expect(page.getByTestId('calendar-review-rewrite-export-1')).not.toHaveClass(
            /wf-btn--primary/,
          )
          await check(
            '予定の確認のダイアログ（05-detail.html）に、予定の日時、職員、最後に変わった日時、理由、予定を開くと、主ボタンの色でない「buddy の内容で書き直す」が出て、「Google の内容に合わせる」が無い',
          )

          await step('右上の × を押す')
          await page.getByTestId('calendar-review-close').click()
          await expect(page).toHaveURL(/01-list\.html/)
          await check('一覧のモック（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}予定の確認のダイアログのモックで buddy の内容で書き直すを押した場合、赤の確定のボタンの確認のダイアログが出て、キャンセルで予定の確認に戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-rewrite',
          title:
            '書き直すの確認のダイアログは、確定の「書き直す」が赤で、「数十秒のうちに」の文が無く、キャンセルで予定の確認へ戻る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}05-detail.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${REVIEW}05-detail.html`))
          await step('「buddy の内容で書き直す」を押す')
          await page.getByTestId('calendar-review-rewrite-export-1').click()
          await expect(page).toHaveURL(/06-rewrite\.html/)
          await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/wf-btn--danger/)
          await expect(page.getByTestId('calendar-rewrite-notice')).not.toContainText('数十秒')
          await check(
            '書き直すダイアログ（06-rewrite.html）の確定の「書き直す」が赤で、注意の文に「数十秒のうちに」が無い',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('calendar-rewrite-cancel').click()
          await expect(page).toHaveURL(/05-detail\.html/)
          await check('予定の確認のダイアログ（05-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}確認が必要な予定の一覧のモックで buddy でキャンセルした予定の行を押した場合、書き直すだけを出し、Google の予定を消す確認になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-cancelled',
          title:
            'キャンセルした予定の行を押すと、書き直すだけを出し、書き直すと Google カレンダーの予定を消すことを確認する',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${REVIEW}01-list.html`))
          await step('5 行目の、buddy でキャンセルした予定を押す')
          await page.getByTestId('calendar-review-row-schedule-schedule-4').click()
          await expect(page).toHaveURL(/12-detail-cancelled\.html/)
          await expect(page.getByTestId('calendar-review-rewrite-export-5')).toBeVisible()
          await expect(page.getByTestId('calendar-review-dialog')).not.toContainText(
            'Google の内容に合わせる',
          )
          await check(
            'キャンセルした予定の確認（12-detail-cancelled.html）に、「Google の内容に合わせる」が無く、「buddy の内容で書き直す」だけがある',
          )

          await step('「buddy の内容で書き直す」を押す')
          await page.getByTestId('calendar-review-rewrite-export-5').click()
          await expect(page).toHaveURL(/13-rewrite-cancelled\.html/)
          await expect(page.getByTestId('calendar-rewrite-notice')).toHaveText(
            'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。',
          )
          await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/wf-btn--danger/)
          await check('Google カレンダーの予定を消すことを示し、確定の「書き直す」が赤である')
        },
      )
    })

    test(`${prefix}書き直しの失敗のモックを開いた場合、書き直す待ちの語を使わない文が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-mock-rewrite-error',
          title: '書き直しの失敗の文は、「書き直す待ち」ではなく、職員から見た結果で書く',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${REVIEW}08-rewrite-error.html`))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(`${REVIEW}08-rewrite-error.html`))
          await expect(page.getByTestId('calendar-rewrite-error')).toHaveText(
            'この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。',
          )
          await check(
            '書き直しの失敗のモック（08-rewrite-error.html）に「この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。」が出る',
          )
        },
      )
    })

    test(`${prefix}パソコンの幅でカレンダーの連携の一覧のモックを開いた場合、結び付けていない行は空のセルと結び付けるだけ、結び付けた行は…を置き、サービスアカウントの語が無いこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-list-desktop',
          title:
            'カレンダーの連携の一覧は、結び付けていない行に「結び付ける」を 1 つ、結び付けた行に「…」を置き、共有の相手は「共有する相手のメールアドレス」と書く',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
          const rows = page.getByTestId('calendar-link-row-{職員の id}')
          const linked = rows.nth(0)
          const unlinked = rows.nth(1)
          await expect(linked.getByTestId('calendar-link-menu-{職員の id}')).toBeVisible()
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
          await check(
            '結び付けた職員 A と C の行の右端は「…」だけで、結び付けていない職員 B と D の行は、カレンダーと最後の取り込みのセルが空で「結び付ける」だけがある。画面に「サービスアカウント」の語が無い',
          )
        },
      )
    })

    test(`${prefix}スマートフォンの幅でカレンダーの連携の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-list-phone',
          title:
            'スマートフォンの幅のカレンダーの連携の一覧は、1 行目に職員と行の操作、2 行目にカレンダーの ID と最後の取り込みを並べる',
          actor: 'ログインなし',
          variant,
          viewport: PHONE_VIEWPORT,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
          await expect(page.getByTestId('calendar-link-row-{職員の id}').first()).toHaveCSS(
            'display',
            'flex',
          )
          await expect(mockRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check(
            '行が 2 行のリストになり、見出しと値を積んだカードにならない。横にスクロールしない',
          )
        },
      )
    })

    test(`${prefix}カレンダーの連携の一覧のモックで…を押した場合、取り込むと赤の外すのメニューが出て、外すで確認のダイアログが出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-row-menu',
          title:
            '「…」のメニューに取り込むと外すが並び、外すは赤で最後にある。外すを押すと、同じ予定を二度は取り込まないことを示す確認が出る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
          await step('職員 A の行の「…」を押す')
          await page.getByTestId('calendar-link-menu-{職員の id}').first().click()
          await expect(page).toHaveURL(/11-menu\.html/)
          const remove = page.getByTestId('calendar-link-remove-{職員の id}').first()
          await expect(page.getByTestId('calendar-link-import-{職員の id}').first()).toBeVisible()
          await expect(remove).toHaveClass(/wf-menu__item--danger/)
          await check('メニューに「取り込む」と、赤の「外す」がこの順に出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/01-list\.html/)
          await check('メニューが閉じ、一覧のモック（01-list.html）へ戻る')

          await step('もう一度「…」を押し、「外す」を押す')
          await page.getByTestId('calendar-link-menu-{職員の id}').first().click()
          await page.getByTestId('calendar-link-remove-{職員の id}').first().click()
          await expect(page).toHaveURL(/05-unlink\.html/)
          await expect(page.getByTestId('calendar-unlink-dialog')).toContainText(
            '結び付け直しても、同じ予定を二度は取り込みません。',
          )
          await expect(page.getByTestId('calendar-unlink-submit')).toHaveClass(/wf-btn--danger/)
          await check(
            '外すダイアログ（05-unlink.html）に「結び付け直しても、同じ予定を二度は取り込みません。」が出て、確定の「外す」が赤である',
          )
        },
      )
    })

    test(`${prefix}カレンダーの連携の一覧のモックで共有の手順の詳しくを押した場合、手順が開閉し、結び付けていない事業所では開いて始まること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-guide',
          title:
            '共有の手順は「詳しく」で開閉し、どの職員も結び付けていない事業所では開いた状態で始まる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${LINK}01-list.html`))
          const toggle = page.getByTestId('calendar-link-guide-toggle')
          const steps = page.getByTestId('calendar-link-steps')
          await expect(toggle).toHaveText('詳しく')
          await expect(steps).toBeHidden()
          await check(
            '結び付けた職員がいる一覧のモック（01-list.html）では、共有の手順が閉じている',
          )

          await step('「詳しく」を押す')
          await toggle.click()
          await expect(steps).toBeVisible()
          await check('3 つの共有の手順が開く')

          await step('もう一度「詳しく」を押す')
          await toggle.click()
          await expect(steps).toBeHidden()
          await check('共有の手順が閉じる')

          await step('結び付けていない事業所のモック（10-no-links.html）を開く')
          await page.goto(mockUrl(`${LINK}10-no-links.html`))
          await expect(steps).toBeVisible()
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await check('共有の手順が開いた状態で始まる')
        },
      )
    })

    test(`${prefix}結び付けるダイアログのモックでカレンダーの ID の ? を押した場合、説明が出て、読めないときの文が共有する相手のメールアドレスを指すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-dialog-help',
          title:
            'カレンダーの ID の説明は ? のヘルプで出し、読めないときの文は「上に出ている buddy のメールアドレス」を指す',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}02-link.html`))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(`${LINK}02-link.html`))
          const helpText = page.getByTestId('schedule-link-calendar-id-help-text')
          await expect(helpText).toBeHidden()
          await check(
            '結び付けるダイアログ（02-link.html）のカレンダーの ID の下に、補足の文が無い',
          )

          await step('カレンダーの ID の右の ? を押す')
          await page.getByTestId('schedule-link-calendar-id-help').click()
          await expect(helpText).toBeVisible()
          await check('カレンダーの ID がどこにあるかの説明が出る')

          await step('読めないときのモック（04-link-unreadable.html）を開く')
          await page.goto(mockUrl(`${LINK}04-link-unreadable.html`))
          await expect(page.getByTestId('calendar-link-check-result')).toHaveText(
            'このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているかと、カレンダーの ID が合っているかを確認してください。',
          )
          await check(
            '読めないときの文が、サービスアカウントではなく「上に出ている buddy のメールアドレス」を指す',
          )
        },
      )
    })

    test(`${prefix}準備ができていないときのカレンダーの連携のモックを開いた場合、頼む相手を書いた文が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-mock-not-configured',
          title:
            'Google カレンダーの設定が無い事業所では、サービスアカウントの語を使わずに頼む相手を示す',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(`${LINK}08-not-configured.html`))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(`${LINK}08-not-configured.html`))
          await expect(page.getByTestId('calendar-link-not-configured')).toHaveText(
            'この事業所では、まだ Google カレンダーを使う準備ができていません。buddy の管理者に設定を頼んでください。',
          )
          await check(
            '「この事業所では、まだ Google カレンダーを使う準備ができていません。buddy の管理者に設定を頼んでください。」が出る',
          )
        },
      )
    })
  }
})
