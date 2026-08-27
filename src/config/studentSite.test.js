import { describe, expect, it } from 'vitest';
import { getStudentClassSiteUrl, STUDENT_SITE_BASE_URL } from './studentSite';

describe('Student Site production URLs', () => {
  it('builds a production class URL from the existing slug without a duplicate slash', () => {
    expect(STUDENT_SITE_BASE_URL).toBe('https://nuruanna.gitverse.site/english39/');
    expect(getStudentClassSiteUrl('class-xxxxxxxx')).toBe('https://nuruanna.gitverse.site/english39/#/class/class-xxxxxxxx');
    expect(getStudentClassSiteUrl('class-xxxxxxxx')).not.toContain('english39//#');
  });

  it.each([null, undefined, '', '   '])('returns null for an unavailable slug (%s)', slug => {
    expect(getStudentClassSiteUrl(slug)).toBeNull();
  });

  it('keeps the same URL regardless of inactive site state', () => {
    const grade8B = { slug: 'class-grade8btest', is_active: false };
    expect(getStudentClassSiteUrl(grade8B.slug)).toBe('https://nuruanna.gitverse.site/english39/#/class/class-grade8btest');
    expect(grade8B.is_active).toBe(false);
  });
});
