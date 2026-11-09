import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'

import { newStaff, registerStaffId } from '../fixtures/staff'

/** 職員を休職か退職か、訪問しない職員（ADR-0006）にする、fixtures/staff の操作。 */
type StopStaff = (request: APIRequestContext, token: string, userId: string) => Promise<APIResponse>

/** token の職員で、走らせるたびに違うメールの職員を 1 人登録し、ID と名前を返す。登録できなければ Error を投げる。 */
export const registerNewStaff = async (
  request: APIRequestContext,
  token: string,
  label: string,
) => {
  const staff = newStaff(label)
  return { id: await registerStaffId(request, token, staff), name: staff.name }
}

/** token の職員で、職員を 1 人登録して stop で休職か退職か、訪問しない職員にし、ID と名前を返す。 */
export const registerStoppedStaff = async (
  request: APIRequestContext,
  token: string,
  stop: StopStaff,
) => {
  const staff = await registerNewStaff(request, token, 'stopped')
  expect((await stop(request, token, staff.id)).status()).toBe(200)
  return staff
}
