export const STUDENT_SITE_BASE_URL = 'https://nuruanna.gitverse.site/english39/';

export function getStudentClassSiteUrl(slug) {
  if (typeof slug !== 'string' || !slug.trim()) return null;
  return `${STUDENT_SITE_BASE_URL.replace(/\/+$/, '')}/#/class/${encodeURIComponent(slug.trim())}`;
}
