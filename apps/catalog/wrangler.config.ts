// cf の 1.0.0-beta は、静的なファイルの置き場を wrangler の設定から読み、ビルドを wrangler に任せる。
import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  assetsDirectory: '../web/storybook-static',
})
