import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/202608300001_add_homework_audio_support.sql', import.meta.url), 'utf8');

describe('Homework audio migration contract', () => {
  it('adds audio without removing existing asset types and raises only the public asset bucket limit', () => {
    for (const type of ['image', 'link', 'pdf', 'audio']) expect(sql).toContain(`'${type}'::text`);
    expect(sql).toContain("asset_type in ('image', 'pdf', 'audio')");
    expect(sql).toContain("where id = 'class-site-assets'");
    expect(sql).toContain('set file_size_limit = 20971520');
    expect(sql).not.toMatch(/allowed_mime_types\s*=/);
  });

  it('returns only public image/audio files from both Homework RPC paths', () => {
    expect(sql.match(/\band asset\.asset_type in \('image', 'audio'\)/g)).toHaveLength(2);
    expect(sql.match(/meaningful_asset\.asset_type in \('image', 'audio'\)/g)).toHaveLength(2);
    expect(sql.match(/\band asset\.bucket = 'class-site-assets'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/asset\.asset_type in \([^)]*link/);
    expect(sql).not.toMatch(/asset\.asset_type in \([^)]*pdf/);
  });

  it('adds playback metadata to the snake_case RPC and preserves deterministic ordering', () => {
    for (const key of ['asset_type', 'storage_path', 'mime_type', 'size_bytes', 'title', 'sort_order', 'width', 'height']) expect(sql).toContain(`'${key}'`);
    expect(sql).toContain('order by asset.sort_order, asset.id');
    expect(sql).toContain('order by ha.assigned_date, ha.id');
  });

  it('preserves security and publication boundaries', () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
    expect(sql).toContain("ha.publication_status = 'published'");
    expect(sql).toContain("ht.content_status = 'ready'");
    expect(sql).toContain('revoke all on function public.get_published_homework(text) from public');
    expect(sql).toContain('grant execute on function public.get_published_homework(text) to anon, authenticated');
  });
});
