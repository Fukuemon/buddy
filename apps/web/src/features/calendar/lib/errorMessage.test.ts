import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/client'

import {
  FORBIDDEN_MESSAGE,
  acceptErrorMessage,
  importErrorMessage,
  linkErrorMessage,
  previewErrorMessage,
  unlinkErrorMessage,
} from './errorMessage'

const apiError = (status: number, code?: string) => new ApiError(status, '失敗', [], code)

describe('linkErrorMessage', () => {
  it.each([
    [apiError(422, 'calendar_unreadable'), 'このカレンダーを読めません。'],
    [apiError(409, 'calendar_taken'), 'このカレンダーは、ほかの職員に結び付いています。'],
    [apiError(409, 'staff_has_calendar'), 'この職員には、ほかのカレンダーが結び付いています。'],
    [apiError(409, 'calendar_already_linked'), 'この職員にすでに結び付いています。'],
    [apiError(502, 'calendar_unavailable'), 'Google カレンダーに届きませんでした。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), '確かめられませんでした。'],
    [new Error('network'), '確かめられませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(linkErrorMessage(error)).toContain(expected)
  })
})

describe('unlinkErrorMessage', () => {
  it('権限を外されたときだけ、権限の文にする', () => {
    expect(unlinkErrorMessage(apiError(403))).toBe(FORBIDDEN_MESSAGE)
    expect(unlinkErrorMessage(apiError(404, 'not_found'))).toBe(
      '外せませんでした。時間をおいて、もう一度外してください。',
    )
  })
})

describe('previewErrorMessage', () => {
  it.each([
    [apiError(502, 'calendar_unavailable'), 'Google カレンダーから予定を読めませんでした。'],
    [apiError(422, 'calendar_unreadable'), '青木 一郎 の Google カレンダーを読めません。'],
    [apiError(503, 'calendar_not_configured'), 'サービスアカウントが設定されていないので'],
    [apiError(404, 'not_found'), 'この職員のカレンダーの結び付けが外れています。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), '下見できませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(previewErrorMessage(error, '青木 一郎')).toContain(expected)
  })
})

describe('importErrorMessage', () => {
  it.each([
    [
      apiError(409, 'import_preview_changed'),
      '下見の後に、Google カレンダーの予定が変わりました。',
    ],
    [apiError(409, 'import_running'), 'この職員の取り込みが、ほかの画面で進んでいます。'],
    [apiError(400, 'invalid_input'), '選んだ利用者が見つかりません。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(404, 'not_found'), 'この職員のカレンダーの結び付けが外れています。'],
    [apiError(502, 'calendar_unavailable'), '取り込めませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(importErrorMessage(error)).toContain(expected)
  })
})

describe('acceptErrorMessage', () => {
  it.each([
    [
      apiError(409, 'export_not_in_review'),
      'この予定は、すでに書き直す待ちにしたか、解いています。',
    ],
    [apiError(409, 'export_not_acceptable'), 'buddy の内容で書き直してください。'],
    [apiError(409, 'external_change_unappliable'), 'buddy の予定に読み替えられません。'],
    [apiError(422, 'calendar_unreadable'), 'カレンダーの共有が外れていないか'],
    [apiError(503, 'calendar_not_configured'), 'サービスアカウントが設定されていないので'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(502, 'calendar_unavailable'), 'Google カレンダーの内容に合わせられませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(acceptErrorMessage(error)).toContain(expected)
  })
})
