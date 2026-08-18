import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';

const mocks = vi.hoisted(() => ({
  payload: null,
  filter: null,
  row: null,
  realtimeConfig: null,
  realtimeCallback: null,
  realtimeStatus: null,
}));

vi.mock('../lib/supabase', () => ({
  supabaseConfigurationError: null,
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'authenticated-user' } }, error: null })) },
    realtime: { setAuth: vi.fn(async () => undefined) },
    channel: vi.fn(() => ({
      on(_type, config, callback) { mocks.realtimeConfig = config; mocks.realtimeCallback = callback; return this; },
      subscribe(callback) { mocks.realtimeStatus = callback; callback('SUBSCRIBED'); return this; },
    })),
    removeChannel: vi.fn(async () => 'ok'),
    from: vi.fn(() => ({
      update(payload) { mocks.payload = payload; mocks.row = { ...payload }; return this; },
      eq(field, value) { mocks.filter = [field, value]; return this; },
      select() { return this; },
      async single() { return { data: mocks.row, error: null }; },
    })),
  },
}));

import { subscribeToCloudState, updateCloudState } from './cloudStateService';

describe('cloud state update request', () => {
  beforeEach(() => { mocks.payload = null; mocks.filter = null; mocks.row = null; mocks.realtimeConfig = null; mocks.realtimeCallback = null; mocks.realtimeStatus = null; });

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

  it('subscribes only to UPDATE events for the authenticated user and removes the channel', async () => {
    const onUpdate = vi.fn();
    const onStatus = vi.fn();
    const userId = '123e4567-e89b-42d3-a456-426614174000';
    const remove = await subscribeToCloudState({ userId, accessToken: 'test-session-token', onUpdate, onStatus });
    const { supabase } = await import('../lib/supabase');
    expect(supabase.realtime.setAuth).toHaveBeenCalledWith('test-session-token');
    expect(mocks.realtimeConfig).toEqual({ event: 'UPDATE', schema: 'public', table: 'app_states' });
    mocks.realtimeCallback({ new: { user_id: 'another-user', updated_at: 'ignored' } });
    expect(onUpdate).not.toHaveBeenCalled();
    mocks.realtimeCallback({ new: { user_id: userId, updated_at: 'now' } });
    expect(onUpdate).toHaveBeenCalledWith({ user_id: userId, updated_at: 'now' });
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED', undefined);
    await remove();
    expect(supabase.removeChannel).toHaveBeenCalledOnce();
  });

  it('rejects invalid Realtime authentication inputs before creating a channel', async () => {
    await expect(subscribeToCloudState({ userId: 'not-a-uuid', accessToken: 'token', onUpdate: vi.fn(), onStatus: vi.fn() })).rejects.toThrow(/valid authenticated user ID/i);
    await expect(subscribeToCloudState({ userId: '123e4567-e89b-42d3-a456-426614174000', accessToken: '', onUpdate: vi.fn(), onStatus: vi.fn() })).rejects.toThrow(/session token/i);
  });
});
