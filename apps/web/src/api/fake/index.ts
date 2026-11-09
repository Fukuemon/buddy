// loadFake が import() で読み込むモジュール。bff のビルドではこのモジュールごと読まれない。
export { createFakeBuddyApi } from './fakeBuddyApi'
export { createFakeReceiptApi } from './fakeReceiptApi'
export { FAKE_VIEWER } from './fixtures'
