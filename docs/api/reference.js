/**
 * API の参照のページに、隣に置いた OpenAPI の仕様（openapi.yaml へのシンボリックリンク）を Scalar で描く。
 * 描く仕様は、ページの body の data-api-definition で指す。Scalar は読み込むと、data-spec を持つ要素を探して古い形の初期化を流すので、その名前を避ける。
 * 要求を試す機能（Test Request）は、手元の compose の API を呼ぶために残す。仕様の servers は compose のポートを指し、API は手元の文書のサイト（zensical serve）のオリジンに CORS を許す。
 * トークンは、CONTRIBUTING.md の手順で開発用の IdP から取り、認証の欄に貼る。公開した文書のサイトのオリジンには CORS を許していないので、そこからは呼べない。
 * API のクライアントを開くボタンと、AI のチャットは使わないので隠す。
 * 色はサイトのトークンに合わせて明るい表示だけにする。
 * Scalar は jsDelivr から読むので、CDN に届かないときはページが空になる。設計書の参照のページなので、それを許す。
 * 出典: https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/dist/browser/standalone.js（設定の項目と data-spec の扱い）
 */
import { createApiReference } from 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/esm.js'

createApiReference('#app', {
  url: document.body.dataset.apiDefinition,
  hideClientButton: true,
  showDeveloperTools: 'never',
  authentication: { preferredSecurityScheme: 'bearerAuth' },
  agent: { disabled: true },
  hideDarkModeToggle: true,
  forceDarkModeState: 'light',
  withDefaultFonts: false,
})
