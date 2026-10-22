// cf の 1.0.0-beta は、静的なファイルの配置先を wrangler の設定から読み、ビルドを wrangler に任せる。
import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
  assetsDirectory: 'public',
})
