import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { createDebouncedCloudSaver, createRealtimeStateCoordinator, loadCloudPrimaryState, migrateCloudRow } from './cloudPersistenceService';

const copy = value => JSON.parse(JSON.stringify(value));

describe('cloud-primary persistence', () => {
  afterEach(() => vi.useRealTimers());

  it('uses and caches cloud state even when a different local cache exists', async () => {
    const cloud = copy(seedState);
    cloud.academicCalendar.excludedDates = ['2026-11-04'];
    const local = copy(seedState);
    const saveCache = vi.fn();
    const result = await loadCloudPrimaryState({
      fetchCloud: async () => ({ state: cloud, updated_at: '2026-08-18T10:00:00Z' }),
      loadCache: () => local,
      saveCache,
    });
    expect(result.source).toBe('cloud');
    expect(result.state.academicCalendar.excludedDates).toEqual(['2026-11-04']);
    expect(result.cloudWritable).toBe(true);
    expect(saveCache).toHaveBeenCalledWith(result.state);
  });

  it('uses the same row migration for a serialized Realtime JSONB payload', () => {
    const remote = copy(seedState);
    remote.academicCalendar.academicYear.end = '2027-05-31';
    const migrated = migrateCloudRow({
      schema_version: seedState.schemaVersion,
      state: JSON.stringify(remote),
      updated_at: '2026-08-19T10:00:00Z',
    });
    expect(migrated.academicCalendar.academicYear.end).toBe('2027-05-31');
    expect(migrated.schemaVersion).toBe(seedState.schemaVersion);
  });

  it('can read the database schema_version when the JSON has no version field', () => {
    const remote = copy(seedState);
    delete remote.schemaVersion;
    expect(migrateCloudRow({ schema_version: seedState.schemaVersion, state: remote }).schemaVersion).toBe(seedState.schemaVersion);
  });

  it('uses a valid cache after a failed fetch without enabling cloud writes', async () => {
    const local = copy(seedState);
    local.academicCalendar.noSchoolDays = [{ date: '2026-09-01' }];
    const saveCache = vi.fn();
    const result = await loadCloudPrimaryState({
      fetchCloud: async () => { throw new Error('network unavailable'); },
      loadCache: () => local,
      saveCache,
    });
    expect(result).toMatchObject({ source: 'cache', status: 'offline', cloudWritable: false });
    expect(result.state).toBe(local);
    expect(saveCache).not.toHaveBeenCalled();
  });

  it('does not treat a failed fetch as a missing cloud row', async () => {
    const failed = await loadCloudPrimaryState({
      fetchCloud: async () => { throw new Error('timeout'); },
      loadCache: () => null,
      saveCache: vi.fn(),
    });
    const missing = await loadCloudPrimaryState({
      fetchCloud: async () => null,
      loadCache: () => null,
      saveCache: vi.fn(),
    });
    expect(failed.status).toBe('offline');
    expect(missing.status).toBe('not_initialized');
    expect(failed.cloudWritable).toBe(false);
    expect(missing.cloudWritable).toBe(false);
  });

  it('debounces edits and saves only the latest full state', async () => {
    vi.useFakeTimers();
    const saveCloud = vi.fn().mockResolvedValue(undefined);
    const statuses = [];
    const saver = createDebouncedCloudSaver({ saveCloud, delay: 750, onStatus: status => statuses.push(status) });
    saver.queue({ schemaVersion: 10, value: 1 });
    saver.queue({ schemaVersion: 10, value: 2 });
    expect(saveCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    expect(saveCloud).toHaveBeenCalledTimes(1);
    expect(saveCloud).toHaveBeenCalledWith({ schemaVersion: 10, value: 2 });
    expect(statuses.at(-1)).toBe('saved');
  });

  it('surfaces and logs a debounced cloud-write failure', async () => {
    vi.useFakeTimers();
    const error = Object.assign(new Error('RLS denied the update'), { code: '42501' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const statuses = [];
    const saver = createDebouncedCloudSaver({
      saveCloud: vi.fn().mockRejectedValue(error),
      delay: 750,
      onStatus: (status, detail) => statuses.push({ status, detail }),
    });
    saver.queue(copy(seedState));
    await vi.advanceTimersByTimeAsync(750);
    expect(statuses.at(-1)).toEqual({ status: 'sync_error', detail: error });
    expect(log).toHaveBeenCalledWith('[cloud persistence] Save failed.', expect.objectContaining({ code: '42501' }));
    log.mockRestore();
  });

  it('applies a remote update to memory/cache without queuing another save', async () => {
    const remote = copy(seedState);
    remote.academicCalendar.academicYear.end = '2027-05-31';
    const saver = { isPending: vi.fn(() => false), flush: vi.fn(), queue: vi.fn() };
    const applyRemote = vi.fn();
    const coordinator = createRealtimeStateCoordinator({
      saver,
      fetchCloud: vi.fn(),
      migrateRow: migrateCloudRow,
      getLastUpdatedAt: () => 'older-update',
      applyRemote,
      onError: vi.fn(),
    });
    await coordinator.receive({ state: remote, updated_at: 'remote-update' });
    expect(applyRemote).toHaveBeenCalledWith(remote, 'remote-update');
    expect(saver.queue).not.toHaveBeenCalled();
  });

  it('ignores an own echo and flushes pending work before refetching a remote update', async () => {
    const latest = copy(seedState);
    latest.academicCalendar.excludedDates = ['2026-11-04'];
    let marker = 'own-update';
    const saver = { isPending: vi.fn(() => false), flush: vi.fn(), queue: vi.fn() };
    const applyRemote = vi.fn();
    const fetchCloud = vi.fn(async () => ({ state: latest, updated_at: 'latest-update' }));
    const coordinator = createRealtimeStateCoordinator({ saver, fetchCloud, migrateRow: migrateCloudRow, getLastUpdatedAt: () => marker, applyRemote, onError: vi.fn() });
    await coordinator.receive({ state: latest, updated_at: 'own-update' });
    expect(applyRemote).not.toHaveBeenCalled();
    saver.isPending.mockReturnValue(true);
    await coordinator.receive({ state: copy(seedState), updated_at: 'remote-update' });
    expect(saver.flush).toHaveBeenCalledOnce();
    expect(fetchCloud).toHaveBeenCalledOnce();
    expect(applyRemote).toHaveBeenCalledWith(latest, 'latest-update');
  });
});
