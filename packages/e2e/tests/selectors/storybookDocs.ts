import type { Page } from '@playwright/test'

/** Storybook の Docs のページが story を描く iframe。Storybook が作る要素なので testid が無い。 */
export const docsStoryFrames = (page: Page) => page.locator('#storybook-docs iframe')

/** Docs のページに直接描かれた、開いている `<dialog>`。story を iframe で描けば 0 個になる。 */
export const docsOpenDialogs = (page: Page) => page.locator('#storybook-docs dialog[open]')
