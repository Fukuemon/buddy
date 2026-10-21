/**
 * API の参照のページに、隣に置いた OpenAPI の仕様（openapi.yaml へのシンボリックリンク）を Scalar で描く。
 * 描く仕様は、ページの body の data-api-definition で指す。Scalar は読み込むと、data-spec を持つ要素を探して古い形の初期化を流すので、その名前を避ける。
 * 仕様の API は認証が要り、文書のサイトからは呼べないので、要求を試す機能を隠し、AI のチャットを止める。
 * 色はサイトのトークンに合わせて明るい表示だけにする。
 * Scalar は jsDelivr から読むので、CDN に届かないときはページが空になる。設計書の参照のページなので、それを許す。
 * 出典: https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/dist/browser/standalone.js（設定の項目と data-spec の扱い）
 */
import { createApiReference } from 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/esm.js'

createApiReference('#app', {
  url: document.body.dataset.apiDefinition,
  hideClientButton: true,
  hideTestRequestButton: true,
  showDeveloperTools: 'never',
  agent: { disabled: true },
  hideDarkModeToggle: true,
  forceDarkModeState: 'light',
  withDefaultFonts: false,
})
