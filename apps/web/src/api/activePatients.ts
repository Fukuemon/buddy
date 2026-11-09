import type { Patient } from '#/api/types'

/** 予定のフォームの利用者の候補に出す利用者。利用の終了の利用者を除き、並びは変えない（ADR-0005）。 */
export const activePatients = (patients: Patient[]) => patients.filter((patient) => !patient.ended)
