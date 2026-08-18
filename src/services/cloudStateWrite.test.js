import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';

const mocks = vi.hoisted(() => ({
  payload: null,
  filter: null,
  row: null,
}));

vi.mock('../lib/supabase', () => ({
  supabaseConfigurationError: null,
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'authenticated-user' } }, error: null })) },
    from: vi.fn(() => ({
      update(payload) { mocks.payload = payload; mocks.row = { ...payload }; return this; },
      eq(field, value) { mocks.filter = [field, value]; return this; },
      select() { return this; },
      async single() { return { data: mocks.row, error: null }; },
    })),
  },
}));

import { updateCloudState } from './cloudStateService';

describe('cloud state update request', () => {
  beforeEach(() => { mocks.payload = null; mocks.filter = null; mocks.row = null; });

  it('updates the authenticated row with the complete state, schema, and timestamp', async () => {
    const state = JSON.parse(JSON.stringify(seedState));
    state.academicCalendar.academicYear.end = '2027-05-31';
    const row = await updateCloudState(state);
    expect(mocks.filter).toEqual(['user_id', 'authenticated-user']);
    expect(mocks.payload.state).toEqual(state);
    expect(mocks.payload.schema_version).toBe(state.schemaVersion);
    expect(Date.parse(mocks.payload.updated_at)).not.toBeNaN();
    expect(row.state.academicCalendar.academicYear.end).toBe('2027-05-31');
  });
});
