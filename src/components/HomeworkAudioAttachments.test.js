import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('./HomeworkAudioAttachments.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./HomeworkAdmin.jsx', import.meta.url), 'utf8');
const lesson = readFileSync(new URL('./LessonHomeworkPublish.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/classSitesHomeworkService.js', import.meta.url), 'utf8');

describe('Homework audio editor contract', () => {
  it('renders only audio in deterministic order with a native non-autoplay player', () => {
    expect(component).toContain("asset.asset_type === 'audio'");
    expect(component).toContain('(a.sort_order ?? 0) - (b.sort_order ?? 0)');
    expect(component).toContain('<audio controls preload="metadata"');
    expect(component).not.toMatch(/autoPlay|autoplay|loop=/);
  });

  it('keeps image paths filtered and separate on both editing surfaces', () => {
    expect(admin).toContain("filter(asset => asset.asset_type === 'image')");
    expect(lesson).toContain("filter(asset => asset.asset_type === 'image')");
    expect(admin).toContain('<HomeworkAudioAttachments');
    expect(lesson).toContain('<HomeworkAudioAttachments');
  });

  it('supports multiple MP3 selection, title-on-blur, and removal', () => {
    expect(component).toContain('multiple accept="audio/mpeg,.mp3"');
    expect(component).toContain('aria-label="Audio title"');
    expect(component).toContain('onBlur={() => save()}');
    expect(component).toContain('onRemove(asset)');
  });

  it('writes complete audio metadata and cleans storage after metadata failure', () => {
    for (const fragment of ["asset_type: 'audio'", "bucket: CLASS_SITE_ASSET_BUCKET", "mime_type: 'audio/mpeg'", 'size_bytes: file.size', 'width: null', 'height: null', 'upsert: false']) expect(service).toContain(fragment);
    expect(service).toContain("devError('shared audio rollback'");
    expect(service).toContain('await removeStoragePaths([storagePath])');
    expect(service).toContain(".eq('asset_type', 'audio')");
  });

  it('preserves relational audio while source images and links are synchronized', () => {
    expect(service).toContain("const replacedAssets = oldAssets.filter(asset => ['image', 'link'].includes(asset.asset_type))");
    expect(service).toContain("const preservedAssets = oldAssets.filter(asset => !['image', 'link'].includes(asset.asset_type))");
  });
});
