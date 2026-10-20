/** text を filename のファイルとしてブラウザに保存させる。 */
export const downloadText = (text: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // click の直後に消すと、保存が始まる前に URL が無くなるブラウザがある
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
