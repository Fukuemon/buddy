import { createFakeSchedules, fakePatients, fakeStaff, fakeTeams } from '#/api/fake/fixtures'

import { toCalendarEvents } from '../lib/toCalendarEvents'

/** story とテストで使う基準の日。 */
export const STORY_DATE = '2026-10-20'

export const storySchedules = createFakeSchedules(new Date(2026, 9, 20))
export const storyStaff = fakeStaff
export const storyTeams = fakeTeams
export const storyPatients = fakePatients
export const storyEvents = toCalendarEvents(storySchedules, storyStaff, storyPatients)
