import { describe, expect, it } from 'vitest';
import { cloudStateSummary, verifyCloudState } from './cloudStateService';
import { seedState } from '../data/seed';

const copy = value => JSON.parse(JSON.stringify(value));

describe('cloud state verification', () => {
  it('verifies all required structural counts without changing local state', () => {
    const local = copy(seedState);
    const before = JSON.stringify(local);
    const row = { schema_version: local.schemaVersion, state: copy(local) };
    expect(verifyCloudState(row, local)).toEqual(cloudStateSummary(local));
    expect(JSON.stringify(local)).toBe(before);
  });

  it('rejects an incomplete or structurally different cloud copy', () => {
    const local = copy(seedState);
    const incomplete = { schema_version: local.schemaVersion, state: { schemaVersion: local.schemaVersion } };
    expect(() => verifyCloudState(incomplete, local)).toThrow(/missing/i);
    const changed = copy(local);
    changed.weeklyTimetable.pop();
    expect(() => verifyCloudState({ schema_version: local.schemaVersion, state: changed }, local)).toThrow(/do not match/i);
    const invalid = copy(local);
    invalid.lessons = {};
    expect(() => verifyCloudState({ schema_version: local.schemaVersion, state: invalid }, local)).toThrow(/invalid fields/i);
    const differentCalendar = copy(local);
    differentCalendar.academicCalendar.academicYear.end = '2027-05-31';
    expect(() => verifyCloudState({ schema_version: local.schemaVersion, state: differentCalendar }, local)).toThrow(/does not match/i);
  });
});
