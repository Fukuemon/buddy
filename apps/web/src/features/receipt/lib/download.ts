/** text を filename のファイルとしてブラウザに保存させる。 */
export const downloadText = (text: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
