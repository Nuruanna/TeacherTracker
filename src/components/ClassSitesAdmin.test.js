import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { archivedClassSiteSources, classSiteGrades, copyStudentClassSiteUrl } from './ClassSitesAdmin';

const source = readFileSync(new URL('./ClassSitesAdmin.jsx', import.meta.url), 'utf8');

describe('Class Sites management', () => {
  it('derives sorted grade navigation from relational courses', () => {
    const sites = [8, 2, 5, 3, 4, 2].map((grade, index) => ({ id: index, course: { grade } }));
    expect(classSiteGrades(sites)).toEqual([2, 3, 4, 5, 8]);
  });

  it('displays relational site identity and section labels', () => {
    expect(source).toContain('loadClassSitesFoundation()');
    expect(source).toContain('courseSectionDisplayLabel(site.currentSection)');
    expect(source).toContain('getStudentClassSiteUrl(site.slug)');
    expect(source).not.toContain('<dt>Site ID</dt>');
    expect(source).not.toContain('<code>{site.slug');
    expect(source).toContain('>Activate site</button>');
    expect(source).toContain('>Deactivate site</button>');
    expect(source).not.toContain('syncClassSitesFoundation');
    expect(source).not.toContain('.update(');
    expect(source).not.toContain('.upsert(');
  });

  it('opens and copies the exact production URL without invoking activation', async () => {
    const url = 'https://nuruanna.gitverse.site/english39/#/class/class-grade8btest';
    const writes = [];
    expect(await copyStudentClassSiteUrl(url, { writeText: value => writes.push(value) })).toBe(true);
    expect(writes).toEqual([url]);
    expect(source).toContain('href={siteUrl} target="_blank" rel="noopener noreferrer"');
    expect(source).toContain('onClick={() => copyLink(site, siteUrl)}');
    expect(source).not.toContain('copyLink(site, siteUrl, changeAvailability)');
  });

  it('disables link actions when the relational slug is unavailable', () => {
    expect(copyStudentClassSiteUrl(null, { writeText: () => { throw new Error('must not write'); } })).resolves.toBe(false);
    expect(source).toContain("siteUrl || 'Link unavailable'");
    expect(source).toContain('disabled={!siteUrl}');
  });

  it('requires confirmation before a selected-site write and then reloads relational state', () => {
    expect(source).toContain('const accepted = await confirm(');
    expect(source).toContain('if (!accepted) return;');
    expect(source).toContain('await setClassSiteActive(site.id, nextActive);');
    expect(source).toContain('await reload();');
  });

  it('prevents archived classes from being activated', () => {
    expect([...archivedClassSiteSources([{ id: 'active', type: 'class', archivedAt: null }, { id: 'archived', type: 'class', archivedAt: '2026-08-25' }])]).toEqual(['archived']);
    expect(source).toContain('if (nextActive && archivedSources.has(site.source_teaching_group_id)) return;');
  });

  it('contains no bulk activation control', () => {
    expect(source).not.toMatch(/Activate all|Enable all sites|Publish all sites/i);
  });
});
