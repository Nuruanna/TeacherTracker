import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryState = vi.hoisted(() => ({ data: [], error: null, updates: [], filters: [] }));

vi.mock('../lib/supabase', () => ({
  supabaseConfigurationError: null,
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-1' } }, error: null })) },
    from: vi.fn(table => {
      expect(table).toBe('class_sites');
      return {
        update(values) {
          queryState.updates.push(values);
          return {
            eq(column, value) {
              queryState.filters.push([column, value]);
              return this;
            },
            select: vi.fn(async () => ({ data: queryState.data, error: queryState.error })),
          };
        },
      };
    }),
  },
}));

import { ClassSitesServiceError, setClassSiteActive } from './classSitesService';

describe('Class Site activation writes', () => {
  beforeEach(() => {
    queryState.data = [{ id: 'site-8b', is_active: true }];
    queryState.error = null;
    queryState.updates = [];
    queryState.filters = [];
  });

  it.each([[true], [false]])('updates only is_active for the selected owned site (%s)', async isActive => {
    queryState.data = [{ id: 'site-8b', is_active: isActive }];
    await expect(setClassSiteActive('site-8b', isActive)).resolves.toMatchObject({ id: 'site-8b', is_active: isActive });
    expect(queryState.updates).toEqual([{ is_active: isActive }]);
    expect(queryState.filters).toEqual([['owner_id', 'teacher-1'], ['id', 'site-8b']]);
  });

  it('fails safely when the selected owned row is not returned', async () => {
    queryState.data = [];
    await expect(setClassSiteActive('missing', true)).rejects.toBeInstanceOf(ClassSitesServiceError);
  });

  it('fails safely when Supabase rejects the write', async () => {
    queryState.error = { code: '42501', message: 'policy detail' };
    await expect(setClassSiteActive('site-8b', false)).rejects.toBeInstanceOf(ClassSitesServiceError);
  });
});
