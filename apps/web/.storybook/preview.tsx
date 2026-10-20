import type { Preview } from '@storybook/react-vite'
import sharedPreview from '@buddy/ui/storybook-preview'

import '../src/styles.css'

const preview: Preview = {
  ...sharedPreview,
  parameters: {
    ...sharedPreview.parameters,
    options: {
      storySort: {
        // DESIGN.md の「カタログのページ」の順
        order: [
          'はじめに',
          ['原則', 'アクセシビリティ'],
          'トークン',
          ['色', '文字', '余白と角丸と影'],
          'コンポーネント',
          ['Base', 'Case'],
          'パターン',
          '画面',
          ['Common'],
        ],
      },
    },
  },
}

export default preview
