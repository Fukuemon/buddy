import { expect, test, type Page } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'
import { pageHeading } from '../../selectors/page'

/** 画面が BFF に送った操作の名前を集める。BFF の server function は、操作の名前を本文に入れて送る。 */
const collectOperations = (page: Page) => {
  const bodies: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') bodies.push(request.postData() ?? '')
  })
  return (operation: string) => bodies.some((body) => body.includes(`"${operation}"`))
}

test.describe('画面の権限', () => {
  test.describe('権限を持つ職員', () => {
    test('職員の管理と照合の権限を持つ職員が職員、取り込み、照合の画面を開いた場合、権限が無い表示を出さずに画面を出すこと', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await expect(page.getByTestId('page-forbidden')).toHaveCount(0)

      await page.goto('/schedule/import')
      await expect(pageHeading(page, '予定の取り込み')).toBeVisible()
      await expect(page.getByTestId('page-forbidden')).toHaveCount(0)

      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-form')).toBeVisible()
      await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
    })
  })

  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が職員の画面を開いた場合、URL を変えずに権限が無い表示を出し、職員の一覧を読まないこと', async ({
      page,
    }) => {
      const sent = collectOperations(page)
      await page.goto('/staff')
      const forbidden = page.getByTestId('page-forbidden')
      await expect(forbidden).toContainText('この画面を開く権限がありません')
      await expect(forbidden).toContainText('職員の管理の権限を持つ職員だけが開けます')
      await expect(page).toHaveURL(/\/staff$/)
      await expect(page.getByTestId('site-nav')).toBeVisible()
      await expect(page.getByTestId('staff-list-table')).toHaveCount(0)
      expect(sent('staff.listRecords')).toBe(false)
    })

    test('職員の管理の権限を持たない職員が予定の取り込みの画面を開いた場合、権限が無い表示を出すこと', async ({
      page,
    }) => {
      await page.goto('/schedule/import')
      await expect(page.getByTestId('page-forbidden')).toContainText(
        '職員の管理の権限を持つ職員だけが開けます',
      )
      await expect(pageHeading(page, '予定の取り込み')).toHaveCount(0)
    })

    test('照合の権限を持たない職員が照合の画面を開いた場合、照合の権限が無い表示を出すこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('page-forbidden')).toContainText(
        '照合の権限を持つ職員だけが開けます',
      )
      await expect(page.getByTestId('receipt-check-form')).toHaveCount(0)
      await expect(page.getByTestId('site-nav')).not.toContainText('照合')
    })
  })
})
