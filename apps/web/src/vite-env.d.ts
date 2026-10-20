/** 画面が読む環境変数。意味は README の「API を切り替える」にある。 */
interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'fake' | 'bff'
}
