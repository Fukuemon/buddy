import type { Preview } from '@storybook/react-vite'

import './preview.css'
import sharedPreview from './sharedPreview'

const preview: Preview = {
  ...sharedPreview,
  parameters: {
    ...sharedPreview.parameters,
    options: {
      storySort: {
        // packages/ui/design/catalog.md の「カタログのページ」の順
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
