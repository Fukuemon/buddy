/**
 * API の参照のページに、隣に置いた OpenAPI の仕様（openapi.yaml へのシンボリックリンク）を Scalar で描く。
 * 描く仕様は、ページの body の data-api-definition で指す。Scalar の古い初期化が読む data-spec と重ねない。
 * 仕様の API は認証が要り、文書のサイトからは呼べないので、要求を試す機能を隠す。外部への送信（テレメトリ、AI のチャット）も止める。
 */
import { createApiReference } from 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/esm.js'

createApiReference('#app', {
  url: document.body.dataset.apiDefinition,
  hideClientButton: true,
  hideTestRequestButton: true,
  showDeveloperTools: 'never',
  telemetry: false,
  agent: { disabled: true },
  mcp: { disabled: true },
  withDefaultFonts: false,
})
