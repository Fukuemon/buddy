import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { LINK_LOAD_ERROR_MESSAGE } from '../lib/errorMessage'
import { CalendarLinkView } from './CalendarLinkView'
import { storyLinkRows, storyServiceAccount } from './storyData'

const meta = {
  title: '画面/Calendar/CalendarLinkView',
  component: CalendarLinkView,
  args: {
    state: { status: 'ready', rows: storyLinkRows, serviceAccount: storyServiceAccount },
    onRetry: fn(),
    onLink: fn(),
    onUnlink: fn(),
    onImport: fn(),
    copy: fn(async () => {}),
  },
} satisfies Meta<typeof CalendarLinkView>

export default meta
type Story = StoryObj<typeof meta>

export const List: Story = {}

/** どの職員も結び付けていない事業所。共有の手順を開いた状態で始める。 */
export const NoLinks: Story = {
  args: {
    state: {
      status: 'ready',
      rows: storyLinkRows.map(({ staff }) => ({ staff })),
      serviceAccount: storyServiceAccount,
    },
  },
}

export const Loading: Story = { args: { state: { status: 'loading' } } }

export const LoadError: Story = {
  args: { state: { status: 'error', message: LINK_LOAD_ERROR_MESSAGE } },
}

/** サービスアカウントが設定されていない。結び付けるを押せない。 */
export const NotConfigured: Story = {
  args: { state: { status: 'ready', rows: storyLinkRows, serviceAccount: null } },
}

/** クリップボードにコピーできない。コピーを押すと、メールアドレスの文字を選ぶ。 */
export const CopyRejected: Story = {
  args: {
    copy: fn(async () => {
      throw new Error('コピーを拒まれた')
    }),
  },
}
