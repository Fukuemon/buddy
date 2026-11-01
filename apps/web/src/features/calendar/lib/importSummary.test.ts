import { describe, expect, it } from 'vite-plus/test'

import { createMockImportPreview, createMockImportedPreview } from '#/mocks/scheduleData'

import {
  canSubmitImport,
  countRemaining,
  isAllImported,
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

  it('休職の職員の新しい予定があれば、全て取り込み済みとしない', () => {
    const imported = createMockImportedPreview(range)
    const onLeave = {
      ...imported,
      skipped: [
        {
          date: '2026-11-04',
          start_time: '10:00',
          end_time: '11:00',
          ends_next_day: false,
          all_day: false,
          reason: 'staff_on_leave' as const,
        },
      ],
    }
    expect(isAllImported(onLeave)).toBe(false)
    expect(canSubmitImport(onLeave, {})).toBe(false)
  })
})

describe('件数の箱', () => {
  it('プレビューの件数の箱の補足を、内訳から作り、取り込まないの箱を作らない', () => {
    const boxes = previewCountBoxes(preview)
    expect(boxes.map((box) => box.key)).not.toContain('skipped')
    const [importBox, recurring] = boxes
    expect(importBox.note).toBe(
      '訪問 15 件、通常 3 件。繰り返しの予定を 1 回ずつに分けた 4 件を含む',
    )
    expect(recurring.note).toBe('繰り返しとして 2 件、1 回ずつに分ける 1 件')
  })

  it('確認が必要と取り込み済みの箱に、補足の文を付けない', () => {
    const boxes = previewCountBoxes({
      ...preview,
      counts: { ...preview.counts, needs_review: 1, already_imported: 2 },
    })
    const notes = boxes
      .filter((box) => box.key === 'needs_review' || box.key === 'already_imported')
      .map((box) => box.note)
    expect(notes).toEqual(['', ''])
  })

  it('件数が 0 の箱を作らない', () => {
    const boxes = previewCountBoxes(createMockImportedPreview(range))
    expect(boxes.map((box) => box.key)).toEqual(['already_imported'])
  })
})
