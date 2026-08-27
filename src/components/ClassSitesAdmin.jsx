import { useEffect, useMemo, useState } from 'react';
import { loadClassSitesFoundation, setClassSiteActive } from '../services/classSitesService';
import { courseSectionDisplayLabel } from '../utils/courseSections';
import { useConfirmDialog } from './ConfirmDialog';
import { getStudentClassSiteUrl } from '../config/studentSite';

export const classSiteGrades = sites => [...new Set(sites.map(site => site.course?.grade).filter(Number.isFinite))].sort((a, b) => a - b);

export const archivedClassSiteSources = teachingGroups => new Set((teachingGroups || [])
  .filter(group => group?.type === 'class' && group.archivedAt)
  .map(group => group.id));

export async function copyStudentClassSiteUrl(url, clipboard = globalThis.navigator?.clipboard) {
  if (!url || !clipboard?.writeText) return false;
  await clipboard.writeText(url);
  return true;
}

export default function ClassSitesAdmin({ teachingGroups = [] }) {
  const [sites, setSites] = useState([]);
  const [grade, setGrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busySiteId, setBusySiteId] = useState(null);
  const [notice, setNotice] = useState('');
  const confirm = useConfirmDialog();

  const reload = async () => {
    const result = await loadClassSitesFoundation();
    setSites(result);
    setError('');
  };

  useEffect(() => {
    let active = true;
    loadClassSitesFoundation()
      .then(result => { if (active) { setSites(result); setError(''); } })
      .catch(() => { if (active) setError('Unable to load Class Sites.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const grades = useMemo(() => classSiteGrades(sites), [sites]);
  const activeGrade = grades.includes(grade) ? grade : grades[0];
  const visibleSites = sites.filter(site => site.course?.grade === activeGrade);
  const archivedSources = useMemo(() => archivedClassSiteSources(teachingGroups), [teachingGroups]);

  const changeAvailability = async (site, nextActive) => {
    if (nextActive && archivedSources.has(site.source_teaching_group_id)) return;
    const accepted = await confirm(nextActive ? {
      title: `Activate student site for ${site.display_name}?`,
      message: 'Students with this Class Site link will be able to view published Homework and Study Materials.',
      confirmLabel: 'Activate site', cancelLabel: 'Cancel',
    } : {
      title: `Deactivate student site for ${site.display_name}?`,
      message: 'Students will no longer be able to open this Class Site. Published Homework and Study Materials will remain stored and can become visible again if the site is reactivated.',
      confirmLabel: 'Deactivate site', cancelLabel: 'Cancel', destructive: true,
    });
    if (!accepted) return;
    setBusySiteId(site.id);
    setError('');
    try {
      await setClassSiteActive(site.id, nextActive);
      await reload();
    } catch (changeError) {
      if (import.meta.env.DEV) console.error('[class sites] Availability change failed', changeError);
      setError(`Unable to ${nextActive ? 'activate' : 'deactivate'} this Class Site. Try again.`);
    } finally {
      setBusySiteId(null);
    }
  };

  const copyLink = async (site, url) => {
    setNotice('');
    try {
      const copied = await copyStudentClassSiteUrl(url);
      setNotice(copied ? `Link copied for ${site.display_name}.` : 'Copy is unavailable in this browser.');
    } catch (copyError) {
      if (import.meta.env.DEV) console.error('[class sites] Link copy failed', copyError);
      setNotice('Unable to copy the link.');
    }
  };

  return <section className="classes-section-panel class-sites-panel card">
    <header><h2>Class Sites</h2><p>Manage student site links and availability.</p></header>
    {grades.length > 0 && <nav className="homework-grade-tabs" aria-label="Class Site courses">{grades.map(value => <button className={value === activeGrade ? 'active' : ''} onClick={() => setGrade(value)} key={value}>Grade {value}</button>)}</nav>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    {loading ? <div className="classes-section-empty"><p>Loading Class Sites…</p></div>
      : !sites.length ? <div className="classes-section-empty"><p>No Class Sites found.</p></div>
        : <div className="class-site-cards">{visibleSites.map(site => {
          const siteUrl = getStudentClassSiteUrl(site.slug);
          return <article className="class-site-management-card" key={site.id}>
          <header><div><small>Class</small><h3>{site.display_name}</h3></div><div className="class-site-card-status"><small>Status</small><span className={`class-site-status ${site.is_active ? 'active' : 'inactive'}`}>{site.is_active ? 'Active' : 'Inactive'}</span></div></header>
          <dl>
            <div><dt>Course</dt><dd>{site.course?.display_name || 'Course unavailable'}</dd></div>
            <div className="class-site-current-section"><dt>Current section</dt><dd>{courseSectionDisplayLabel(site.currentSection) || 'Not mapped'}</dd></div>
            <div><dt>Student site</dt><dd className={`class-site-url ${siteUrl ? '' : 'class-site-muted'}`} title={siteUrl || undefined}>{siteUrl || 'Link unavailable'}</dd></div>
          </dl>
          <div className="class-site-link-actions">
            {siteUrl
              ? <a href={siteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${site.display_name} student site`}>Open site</a>
              : <button type="button" disabled aria-label={`Open ${site.display_name} student site`}>Open site</button>}
            <button type="button" disabled={!siteUrl} onClick={() => copyLink(site, siteUrl)} aria-label={`Copy ${site.display_name} student site link`}>Copy link</button>
          </div>
          <footer>{site.is_active
            ? <button className="class-site-deactivate" disabled={busySiteId === site.id} onClick={() => changeAvailability(site, false)}>Deactivate site</button>
            : <button className="primary-settings" disabled={busySiteId === site.id || archivedSources.has(site.source_teaching_group_id)} onClick={() => changeAvailability(site, true)}>Activate site</button>}
            {archivedSources.has(site.source_teaching_group_id) && <small>Archived classes cannot be activated.</small>}
          </footer>
        </article>})}</div>}
  </section>;
}
