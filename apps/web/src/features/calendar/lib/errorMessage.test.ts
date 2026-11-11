import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/BuddyApi'
import { FORBIDDEN_MESSAGE } from '#/api/forbiddenMessage'

import {
  cutoverErrorMessage,
  importErrorMessage,
  linkErrorMessage,
  previewErrorMessage,
  rewriteErrorMessage,
  unlinkErrorMessage,
} from './errorMessage'

const apiError = (status: number, code?: string) => new ApiError(status, '失敗', [], code)

describe('linkErrorMessage', () => {
  it.each([
    [
      apiError(422, 'calendar_unreadable'),
      'このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているか',
    ],
    [apiError(409, 'calendar_taken'), 'このカレンダーは、ほかの職員に結び付いています。'],
    [apiError(409, 'staff_has_calendar'), 'この職員には、ほかのカレンダーが結び付いています。'],
    [apiError(409, 'calendar_already_linked'), 'この職員にすでに結び付いています。'],
    [apiError(502, 'calendar_unavailable'), 'Google カレンダーに届きませんでした。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), '確認できませんでした。'],
    [new Error('network'), '確認できませんでした。'],
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
    [
      apiError(503, 'calendar_not_configured'),
      'まだ Google カレンダーを使う準備ができていません。事業所の管理者に',
    ],
    [apiError(404, 'not_found'), 'この職員のカレンダーの結び付けが外れています。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), 'プレビューできませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(previewErrorMessage(error, '青木 一郎')).toContain(expected)
  })
})

describe('importErrorMessage', () => {
  it.each([
    [
      apiError(409, 'import_preview_changed'),
      'プレビューの後に、Google カレンダーの予定か職員の休職が変わりました。',
    ],
    [apiError(409, 'import_running'), 'この職員の取り込みが、ほかの画面で進んでいます。'],
    [
      apiError(409, 'google_primary'),
      'この事業所の予定は Google カレンダーで管理しているので、buddy に取り込めません。',
    ],
    [apiError(400, 'invalid_input'), '選んだ利用者が見つかりません。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(404, 'not_found'), 'この職員のカレンダーの結び付けが外れています。'],
    [apiError(502, 'calendar_unavailable'), '取り込めませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(importErrorMessage(error)).toContain(expected)
  })
})

describe('rewriteErrorMessage', () => {
  it.each([
    [
      apiError(409, 'export_not_in_review'),
      'この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。',
    ],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), '書き直せませんでした。時間をおいて、もう一度書き直してください。'],
  ])('%s を文にする', (error, expected) => {
    expect(rewriteErrorMessage(error)).toBe(expected)
  })
})

describe('cutoverErrorMessage', () => {
  it.each([
    [apiError(409, 'cutover_open'), 'ほかの画面で移行を始めています。'],
    [apiError(409, 'cutover_not_google_primary'), 'すでに予定を buddy で管理しています。'],
    [
      new ApiError(
        409,
        '最後の同期が成功していないカレンダーがあります（青木 一郎）',
        [],
        'cutover_sync_not_ready',
      ),
      '（青木 一郎）',
    ],
    [apiError(409, 'cutover_not_open'), 'ほかの画面で完了したか、やめています。'],
    [apiError(502, 'calendar_unavailable'), 'もう一度完了してください。'],
    [apiError(403, 'forbidden'), FORBIDDEN_MESSAGE],
    [apiError(500), '操作できませんでした。'],
  ])('%s を文にする', (error, expected) => {
    expect(cutoverErrorMessage(error)).toContain(expected)
  })
})
