import { HttpResponse } from 'msw'

const unauthenticated = () =>
  HttpResponse.json(
    { code: 'unauthenticated', message: 'access token がありません' },
    { status: 401 },
  )

/** Authorization の Bearer が無い要求に、2 つの API と同じく 401 を返す resolver で包む。 */
export const withAuth =
  <
    Args extends {
      request: Request
      response: { untyped: (response: Response) => unknown }
    },
    Result,
  >(
    resolver: (args: Args) => Result,
  ) =>
  (args: Args) =>
    args.request.headers.get('Authorization')?.startsWith('Bearer ')
      ? resolver(args)
      : (args.response.untyped(unauthenticated()) as Result)
