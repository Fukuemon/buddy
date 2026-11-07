/** 画面のデータを読む query のうち、読み直しの判定に使う部分。 */
type ScreenQuery = {
  data: unknown
  isError: boolean
  refetch: () => Promise<unknown>
}

/**
 * 画面のデータの読み込みの状態を返す。全てのデータがあれば、読み直して読めなかったものがあっても ready にし、refetchFailed で示す。
 * データの無いものが読めなかったときだけ error にする。規則は docs/screens/rules.md の「エラーの見せ方」にある。
 */
export const screenLoadStatus = (queries: readonly ScreenQuery[]) => {
  const failed = queries.some((query) => query.isError)
  if (queries.every((query) => query.data !== undefined))
    return { status: 'ready', refetchFailed: failed } as const
  return failed ? ({ status: 'error' } as const) : ({ status: 'loading' } as const)
}

/** 読めなかったデータだけを読み直す。読み終えたデータは捨てない。 */
export const refetchFailedQueries = (queries: readonly ScreenQuery[]) => {
  for (const query of queries) if (query.isError) void query.refetch()
}
