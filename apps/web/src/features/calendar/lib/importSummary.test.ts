import { describe, expect, it } from 'vite-plus/test'

import { createMockImportPreview, createMockImportedPreview } from '#/mocks/scheduleData'

import {
  canSubmitImport,
  countRemaining,
  importedNote,
  isAllImported,
  notImportedNote,
  previewCountBoxes,
  toDecisions,
} from './importSummary'

const range = { range_start: '2026-11-01', range_end: '2026-11-30' }
const preview = createMockImportPreview(range)

describe('取り込み方の選択', () => {
  it('利用者を選ぶは、利用者も選んだときに選び終えたとする', () => {
    const choices = {
      'event-ambiguous': { action: 'patient' },
      'event-missing': { action: 'skip' },
    } as const
    expect(countRemaining(preview.needs_review, choices)).toBe(1)
    expect(canSubmitImport(preview, choices)).toBe(false)
    expect(toDecisions(preview.needs_review, choices)).toEqual([
      { external_event_id: 'event-missing', revision: 'rev-missing', action: 'skip' },
    ])

    const done = {
      ...choices,
      'event-ambiguous': { action: 'patient', patientId: 'patient-1' },
    } as const
    expect(canSubmitImport(preview, done)).toBe(true)
    expect(toDecisions(preview.needs_review, done)).toContainEqual({
      external_event_id: 'event-ambiguous',
      revision: 'rev-ambiguous',
      action: 'patient',
      patient_id: 'patient-1',
    })
  })

  it('全て取り込み済みなら、確定して取り込むを押せない', () => {
    const imported = createMockImportedPreview(range)
    expect(isAllImported(imported)).toBe(true)
    expect(canSubmitImport(imported, {})).toBe(false)
  })
})

describe('件数の文', () => {
  it('下見の件数の箱の補足を、内訳から作る', () => {
    const [importBox, recurring] = previewCountBoxes(preview)
    expect(importBox.note).toBe('訪問 15 件、通常 3 件。回ごとにした 4 件を含む')
    expect(recurring.note).toBe('繰り返しのまま 2 件、回ごとにする 1 件')
    const [none] = previewCountBoxes(createMockImportedPreview(range))
    expect(none.note).toBe('取り込む予定は無い')
  })

  it('取り込みの結果の補足に、取り込み方の内訳と取り込まない理由を入れる', () => {
    const decisions = [
      {
        external_event_id: 'event-ambiguous',
        revision: 'r1',
        action: 'patient',
        patient_id: 'patient-1',
      },
      { external_event_id: 'event-missing', revision: 'r2', action: 'skip' },
    ] as const
    expect(importedNote(preview, decisions)).toBe(
      '繰り返しの予定 3 件を含む。確かめた 2 件のうち 1 件は利用者を選び、1 件は取り込まなかった',
    )
    expect(notImportedNote(preview, decisions)).toBe(
      '終日、日をまたぐ、サービス内容を引けない、取り込まないを選んだ予定',
    )
  })
})
