const pad = (n: number) => String(n).padStart(2, '0')

/** today の前の月を `YYYY-MM` で返す。照合は、月が終わった後に前の月を対象にするためデフォルトにする。 */
export const previousMonth = (today: Date) => {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** value が `YYYY-MM` の月なら true を返す。 */
export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/** 日時を、結果の CSV のファイル名に入れる `YYYY-MM-DD` にする。 */
export const dateStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
