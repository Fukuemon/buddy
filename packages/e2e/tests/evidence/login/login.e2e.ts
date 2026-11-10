import { expect, test, type Page } from '@playwright/test'

import {
  BASE_URL,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OFFICE_A_SCHEDULE,
  OFFICE_B,
  SUSPENDED_STAFF,
  TEAM_MEMBER,
  UNREGISTERED_EMAIL,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { enterEmailAtBroker, signInAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { brokerLogin, idpLogin } from '../../selectors/idp'

/** 録画の外では、ログインせずに web の origin を開いておく。録画の中で、ログインの画面から操作する。 */
const openWeb = async (page: Page) => {
  await page.goto(`${BASE_URL}/auth/error`)
}

const DAY = `/schedule?view=day&date=${OFFICE_A_SCHEDULE.date}`

/** 試行の回数の上限を使い切るメール。ほかの test の UNREGISTERED_EMAIL の上限を使わないよう分ける。 */
const LIMITED_EMAIL = 'limited@example.com'

/** 録画の外で、予定のカレンダーを開いてログインしておく。 */
const signIn = async (page: Page) => {
  await page.goto(DAY)
  await signInAtBroker(page, LOGIN_EMAIL)
  await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
}

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}登録した職員のメールで事業所の上流の IdP に入った場合、予定のカレンダーにその事業所の予定が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-office-a',
            title:
              '登録した職員のメールで、その事業所の上流の IdP に入ると、予定のカレンダーに事業所の予定が出る',
            actor: `${LOGIN_STAFF.name}（1 つ目の事業所のマネージャー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('予定のカレンダーを開くと、ブローカーのメールの入力の画面に移る')

            await step(`メールに ${LOGIN_EMAIL} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, LOGIN_EMAIL)
            await expect(idpLogin(page).username).toBeVisible()
            await check('1 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る')

            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInAtUpstreamIdp(page, LOGIN_EMAIL)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await expect(
              page.getByTestId(/^schedule-event-/).filter({ hasText: OFFICE_A_SCHEDULE.title }),
            ).toBeVisible()
            await check(
              `予定のカレンダーに戻り、1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」が出る`,
            )
          },
        )
      })

      test(`${prefix}2 つ目の事業所の職員のメールで入った場合、その事業所の予定だけが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-office-b',
            title: '2 つ目の事業所の職員でログインすると、2 つ目の事業所の予定だけが出る',
            actor: `${OFFICE_B.staff.name}（2 つ目の事業所のマネージャー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`メールに ${OFFICE_B.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, OFFICE_B.email)
            await expect(idpLogin(page).username).toBeVisible()
            await check('2 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る')

            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInAtUpstreamIdp(page, OFFICE_B.email)
            await expect(page.getByTestId('viewer-menu')).toContainText(OFFICE_B.staff.name)
            const events = page.getByTestId(/^schedule-event-/)
            const officeBEvent = events.filter({ hasText: OFFICE_B.schedule.title })
            await expect(officeBEvent).toBeVisible()
            // 予定は 13 時にあり、録画の高さの外に出るので、判定のスクリーンショットに入るよう寄せる
            await officeBEvent.scrollIntoViewIfNeeded()
            await expect(events.filter({ hasText: OFFICE_A_SCHEDULE.title })).toHaveCount(0)
            await check(
              `2 つ目の事業所の予定「${OFFICE_B.schedule.title}」だけが出て、同じ日の 1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」は出ない`,
            )
          },
        )
      })

      test(`${prefix}登録していないメールを入れた場合、事業所を示さずにログインの失敗の画面が出て予定の画面を開けないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-unregistered-email',
            title:
              '登録していないメールを入れると、事業所を示さずにログインの失敗の画面が出て、予定の画面を開けない',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`登録していないメール ${UNREGISTERED_EMAIL} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, UNREGISTERED_EMAIL)
            await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
            await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
            await check(
              '上流の IdP へ移らず、web のログインの失敗の画面に「ログインできませんでした」が出る',
            )

            await step('予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('予定のカレンダーは開かず、ブローカーのメールの入力の画面に移る')
          },
        )
      })

      test(`${prefix}同じメールで試行の回数の上限を超えてログインを試した場合、待つ長さを伝える文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-too-many-attempts',
            title:
              '同じメールで試行の回数の上限を超えてログインを試すと、ログインの失敗の画面に待つ長さを伝える文が出る',
            actor: 'ログインなし',
            variant,
          },
          async (page) => {
            await openWeb(page)
            // ブローカーは、入れたメールごとに続けて 10 回まで受け付ける。録画の外で 10 回を使い切る
            for (let i = 0; i < 10; i++) {
              await page.goto(DAY)
              await enterEmailAtBroker(page, LIMITED_EMAIL)
              await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
            }
          },
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(
              `録画の前に、登録していないメール ${LIMITED_EMAIL} で 10 回続けて試した。11 回目を入れて「次へ」を押す`,
            )
            await enterEmailAtBroker(page, LIMITED_EMAIL)
            await expect(page).toHaveURL(/\/auth\/error\?reason=too_many_attempts$/)
            const card = page.getByTestId('auth-error')
            await expect(card).toContainText('しばらくログインできません')
            await expect(card).toContainText(
              '続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。',
            )
            await check(
              'ログインの失敗の画面に「しばらくログインできません」と、30 秒ほどおいてから試すよう伝える文が出る',
            )
          },
        )
      })

      test(`${prefix}ログインに失敗した場合、ログインの画面と同じ中央のカードで失敗の文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-failed-card',
            title:
              'ログインに失敗すると、ブローカーのログインの画面と同じ、画面の中央のカードに失敗の文が出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('ブローカーのログインの画面は、画面の中央のカードにメールの入力を出す')

            await step(`登録していないメール ${UNREGISTERED_EMAIL} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, UNREGISTERED_EMAIL)
            await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
            const card = page.getByTestId('auth-error')
            await expect(card).toContainText('ログインできませんでした')
            await expect(card).toContainText(
              '入れたメールアドレスでは、ログインできません。事業所の管理者に、登録のメールアドレスを確認してください。',
            )
            const viewport = page.viewportSize()
            // カードの中心と画面の中心のずれ。中央に置けば、縦と横のどちらも 1px 未満になる
            await expect
              .poll(async () => {
                const box = await card.boundingBox()
                if (box === null || viewport === null) return Number.POSITIVE_INFINITY
                return Math.max(
                  Math.abs(box.x + box.width / 2 - viewport.width / 2),
                  Math.abs(box.y + box.height / 2 - viewport.height / 2),
                )
              })
              .toBeLessThan(1)
            await check(
              'ログインの失敗の画面も、サイトのヘッダーを出さずに、画面の中央のカードにロゴ、「ログインできませんでした」、説明の文、「もう一度ログインする」を出す',
            )
          },
        )
      })

      test(`${prefix}止めた職員のメールを入れた場合、ログインの失敗の画面が出て予定の画面を開けないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-suspended-staff',
            title: '止めた職員のメールを入れると、ログインの失敗の画面が出て、予定の画面を開けない',
            actor: 'ログインなし（2 つ目の事業所の止めた職員）',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`止めた職員のメール ${SUSPENDED_STAFF.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, SUSPENDED_STAFF.email)
            await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
            await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
            await check(
              '上流の IdP へ移らず、web のログインの失敗の画面に「ログインできませんでした」が出る',
            )

            await step('予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('予定のカレンダーは開かず、ブローカーのメールの入力の画面に移る')
          },
        )
      })

      test(`${prefix}上流の IdP のメールが入れたメールと違う場合、ログインの失敗の画面が出てログインしていないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-upstream-email-mismatch',
            title:
              '上流の IdP のメールが入れたメールと違うと、ログインの失敗の画面が出て、トークンを受け取らない',
            actor: `${TEAM_MEMBER.name}（1 つ目の事業所のメンバー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`メールに ${TEAM_MEMBER.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, TEAM_MEMBER.email)
            await expect(idpLogin(page).username).toBeVisible()

            await step('上流の IdP で、別のメール someone.else@example.com を確認済みにして入る')
            await signInAtUpstreamIdp(page, 'someone.else@example.com')
            await expect(page).toHaveURL(/\/auth\/error\?reason=account_mismatch$/)
            await expect(page.getByTestId('auth-error')).toContainText(
              '登録と違うアカウントでログインしました',
            )
            await check('web のログインの失敗の画面に「登録と違うアカウントでログインしました」が出る')

            await step('予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('セッションが無いので、ブローカーのメールの入力の画面に移る')
          },
        )
      })

      test(`${prefix}ログアウトした後に、もう一度ログインしようとした場合、ブローカーのメールの入力の画面が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'logout-relogin',
            title:
              'ログアウトした後に、もう一度ログインしようとすると、ブローカーのメールの入力の画面が出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await step('ログインして、予定のカレンダーを開いている')

            await step('アカウントのボタンを押し、メニューの「ログアウト」を押す')
            await page.getByTestId('viewer-menu-open').click()
            await page.getByTestId('viewer-logout').click()
            await expect(brokerLogin(page).email).toBeVisible()
            await check('Hydra のログインのセッションが消え、ブローカーのメールの入力の画面に移る')

            await step('もう一度ログインしようとして、予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('前の職員として入らず、ブローカーのメールの入力の画面が出る')
          },
        )
      })

      test(`${prefix}ログアウトした後に、ブラウザの戻るで前の画面を開いた場合、ログインの画面へ移ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'logout-back',
            title: 'ログアウトした後に、ブラウザの戻るで前の画面を開くと、ログインの画面へ移る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await step('ログインして、予定のカレンダーを開いている')

            await step('アカウントのボタンを押し、メニューの「ログアウト」を押す')
            await page.getByTestId('viewer-menu-open').click()
            await page.getByTestId('viewer-logout').click()
            await expect(brokerLogin(page).email).toBeVisible()
            await check('ブローカーのメールの入力の画面に移る')

            await step('ブラウザの戻るを押す')
            await page.goBack()
            await expect(brokerLogin(page).email).toBeVisible()
            await expect(page.getByTestId('viewer-menu')).toHaveCount(0)
            await check('前の予定のカレンダーは出ず、ブローカーのメールの入力の画面に移る')
          },
        )
      })
    }
  })
})
