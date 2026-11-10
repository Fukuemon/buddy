import { expect, test, type Browser, type BrowserContext } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import {
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OFFICE_A_SCHEDULE,
  OFFICE_B,
  SUSPENDED_STAFF,
  TEAM_MEMBER,
  UNREGISTERED_EMAIL,
} from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { enterEmailAtBroker, signInAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { brokerLogin, idpLogin } from '../../selectors/idp'

const DAY = `/schedule?view=day&date=${OFFICE_A_SCHEDULE.date}`

/** 試行の回数の上限を使い切るメール。ほかの test の UNREGISTERED_EMAIL の上限を使わないよう分ける。 */
const LIMITED_EMAIL = 'limited@example.com'

/**
 * 録画の外で青木 陽菜でログインし、cookie を context に移す。
 * ログアウトの spec は、setup が保存したログインの状態を使わない。ログアウトでそのセッションを消すと、同じ実行の後の spec がログインできなくなるためである。
 */
const signInOutsideRecording = (browser: Browser, context: BrowserContext) =>
  prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
    await page.goto(DAY)
    await signInAtBroker(page, LOGIN_EMAIL)
    await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
  })

test.describe('予定のカレンダー', () => {
  test.describe('ログイン（ログインなしで始める）', () => {
    test('login-office-a 登録した職員のメールで事業所の上流の IdP に入った場合、予定のカレンダーにその事業所の予定が出ること', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        '登録した職員のメールで、その事業所の上流の IdP に入ると、予定のカレンダーに事業所の予定が出る',
      )

      await check(page, '予定のカレンダーを開くと、ブローカーのメールの入力の画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
      await step(page, `メールに ${LOGIN_EMAIL} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, LOGIN_EMAIL),
      )
      await check(page, '1 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る', () =>
        expect(idpLogin(page).username).toBeVisible(),
      )
      await step(page, '上流の IdP で、同じメールを確認済みにして入る', () =>
        signInAtUpstreamIdp(page, LOGIN_EMAIL),
      )
      await check(
        page,
        `予定のカレンダーに戻り、1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」が出る`,
        async () => {
          await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
          await expect(
            page.getByTestId(/^schedule-event-/).filter({ hasText: OFFICE_A_SCHEDULE.title }),
          ).toBeVisible()
        },
      )
    })

    test('login-office-b 2 つ目の事業所の職員のメールで入った場合、その事業所の予定だけが出ること', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(page, '2 つ目の事業所の職員でログインすると、2 つ目の事業所の予定だけが出る')

      await step(page, `メールに ${OFFICE_B.email} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, OFFICE_B.email),
      )
      await check(page, '2 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る', () =>
        expect(idpLogin(page).username).toBeVisible(),
      )
      await step(page, '上流の IdP で、同じメールを確認済みにして入る', () =>
        signInAtUpstreamIdp(page, OFFICE_B.email),
      )
      await check(
        page,
        `2 つ目の事業所の予定「${OFFICE_B.schedule.title}」だけが出て、同じ日の 1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」は出ない`,
        async () => {
          await expect(page.getByTestId('viewer-menu')).toContainText(OFFICE_B.staff.name)
          const events = page.getByTestId(/^schedule-event-/)
          const officeBEvent = events.filter({ hasText: OFFICE_B.schedule.title })
          await expect(officeBEvent).toBeVisible()
          // 予定は 13 時にあり、録画の高さの外に出るので、判定のスクリーンショットに入るよう寄せる
          await officeBEvent.scrollIntoViewIfNeeded()
          await expect(events.filter({ hasText: OFFICE_A_SCHEDULE.title })).toHaveCount(0)
        },
      )
    })

    test('login-unregistered-email 登録していないメールを入れた場合、事業所を示さずにログインの失敗の画面が出て予定の画面を開けないこと', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        '登録していないメールを入れると、事業所を示さずにログインの失敗の画面が出て、予定の画面を開けない',
      )

      await step(page, `登録していないメール ${UNREGISTERED_EMAIL} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, UNREGISTERED_EMAIL),
      )
      await check(
        page,
        '上流の IdP へ移らず、web のログインの失敗の画面に「ログインできませんでした」が出る',
        async () => {
          await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
          await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
        },
      )
      await step(page, '予定のカレンダーを開き直す', async () => {
        await page.goto(DAY)
      })
      await check(page, '予定のカレンダーは開かず、ブローカーのメールの入力の画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
    })

    test('login-too-many-attempts 同じメールで試行の回数の上限を超えてログインを試した場合、待つ長さを伝える文が出ること', async ({
      browser,
      context,
    }) => {
      // ブローカーは、入れたメールごとに続けて 10 回まで受け付ける。録画の外で 10 回を使い切る
      await prepareOutsideRecording(browser, {}, async (prepPage) => {
        for (let i = 0; i < 10; i++) {
          await prepPage.goto(DAY)
          await enterEmailAtBroker(prepPage, LIMITED_EMAIL)
          await expect(prepPage).toHaveURL(/\/auth\/error\?reason=denied$/)
        }
      })

      const page = await context.newPage()
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        `同じメールで試行の回数の上限を超えてログインを試すと、ログインの失敗の画面に待つ長さを伝える文が出る\n前提 録画の前に、登録していないメール ${LIMITED_EMAIL} で 10 回続けて試した`,
      )

      await step(page, `${LIMITED_EMAIL} で 11 回目を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, LIMITED_EMAIL),
      )
      await check(
        page,
        'ログインの失敗の画面に「しばらくログインできません」と、30 秒ほどおいてから試すよう伝える文が出る',
        async () => {
          await expect(page).toHaveURL(/\/auth\/error\?reason=too_many_attempts$/)
          const card = page.getByTestId('auth-error')
          await expect(card).toContainText('しばらくログインできません')
          await expect(card).toContainText(
            '続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。',
          )
        },
      )
    })

    test('login-failed-card ログインに失敗した場合、ログインの画面と同じ中央のカードで失敗の文が出ること', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        'ログインに失敗すると、ブローカーのログインの画面と同じ、画面の中央のカードに失敗の文が出る',
      )

      await check(
        page,
        'ブローカーのログインの画面は、画面の中央のカードにメールの入力を出す',
        () => expect(brokerLogin(page).email).toBeVisible(),
      )
      await step(page, `登録していないメール ${UNREGISTERED_EMAIL} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, UNREGISTERED_EMAIL),
      )
      await check(
        page,
        'ログインの失敗の画面も、サイトのヘッダーを出さずに、画面の中央のカードにロゴ、「ログインできませんでした」、説明の文、「もう一度ログインする」を出す',
        async () => {
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
        },
      )
    })

    test('login-suspended-staff 止めた職員のメールを入れた場合、ログインの失敗の画面が出て予定の画面を開けないこと', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        '止めた職員のメールを入れると、ログインの失敗の画面が出て、予定の画面を開けない\n前提 2 つ目の事業所の止めた職員',
      )

      await step(page, `止めた職員のメール ${SUSPENDED_STAFF.email} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, SUSPENDED_STAFF.email),
      )
      await check(
        page,
        '上流の IdP へ移らず、web のログインの失敗の画面に「ログインできませんでした」が出る',
        async () => {
          await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
          await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
        },
      )
      await step(page, '予定のカレンダーを開き直す', async () => {
        await page.goto(DAY)
      })
      await check(page, '予定のカレンダーは開かず、ブローカーのメールの入力の画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
    })

    test('login-upstream-email-mismatch 上流の IdP のメールが入れたメールと違う場合、ログインの失敗の画面が出てログインしていないこと', async ({
      page,
    }) => {
      await page.goto(DAY)
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        `上流の IdP のメールが入れたメールと違うと、ログインの失敗の画面が出て、トークンを受け取らない\n前提 ${TEAM_MEMBER.name}（1 つ目の事業所のメンバー）のメールで始める`,
      )

      await step(page, `メールに ${TEAM_MEMBER.email} を入れて「次へ」を押す`, async () => {
        await enterEmailAtBroker(page, TEAM_MEMBER.email)
        await expect(idpLogin(page).username).toBeVisible()
      })
      await step(
        page,
        '上流の IdP で、別のメール someone.else@example.com を確認済みにして入る',
        () => signInAtUpstreamIdp(page, 'someone.else@example.com'),
      )
      await check(
        page,
        'web のログインの失敗の画面に「登録と違うアカウントでログインしました」が出る',
        async () => {
          await expect(page).toHaveURL(/\/auth\/error\?reason=account_mismatch$/)
          await expect(page.getByTestId('auth-error')).toContainText(
            '登録と違うアカウントでログインしました',
          )
        },
      )
      await step(page, '予定のカレンダーを開き直す', async () => {
        await page.goto(DAY)
      })
      await check(page, 'セッションが無いので、ブローカーのメールの入力の画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
    })
  })

  test.describe(`ログアウト（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test('logout-relogin ログアウトした後に、もう一度ログインしようとした場合、ブローカーのメールの入力の画面が出ること', async ({
      browser,
      context,
    }) => {
      await signInOutsideRecording(browser, context)

      const page = await context.newPage()
      await page.goto(DAY)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
      await intro(
        page,
        'ログアウトした後に、もう一度ログインしようとすると、ブローカーのメールの入力の画面が出る\n前提 ログインして、予定のカレンダーを開いている',
      )

      await step(page, 'アカウントのボタンを押し、メニューの「ログアウト」を押す', async () => {
        await page.getByTestId('viewer-menu-open').click()
        await page.getByTestId('viewer-logout').click()
      })
      await check(
        page,
        'Hydra のログインのセッションが消え、ブローカーのメールの入力の画面に移る',
        () => expect(brokerLogin(page).email).toBeVisible(),
      )
      await step(page, 'もう一度ログインしようとして、予定のカレンダーを開き直す', async () => {
        await page.goto(DAY)
      })
      await check(page, '前の職員として入らず、ブローカーのメールの入力の画面が出る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
    })

    test('logout-back ログアウトした後に、ブラウザの戻るで前の画面を開いた場合、ログインの画面へ移ること', async ({
      browser,
      context,
    }) => {
      await signInOutsideRecording(browser, context)

      const page = await context.newPage()
      await page.goto(DAY)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
      await intro(
        page,
        'ログアウトした後に、ブラウザの戻るで前の画面を開くと、ログインの画面へ移る\n前提 ログインして、予定のカレンダーを開いている',
      )

      await step(page, 'アカウントのボタンを押し、メニューの「ログアウト」を押す', async () => {
        await page.getByTestId('viewer-menu-open').click()
        await page.getByTestId('viewer-logout').click()
      })
      await check(page, 'ブローカーのメールの入力の画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
      await step(page, 'ブラウザの戻るを押す', async () => {
        await page.goBack()
      })
      await check(
        page,
        '前の予定のカレンダーは出ず、ブローカーのメールの入力の画面に移る',
        async () => {
          await expect(brokerLogin(page).email).toBeVisible()
          await expect(page.getByTestId('viewer-menu')).toHaveCount(0)
        },
      )
    })
  })
})
