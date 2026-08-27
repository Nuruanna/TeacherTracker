export function courseSectionStructuralLabel(section) {
  if (!section) return '';
  if (section.section_type === 'reading') return 'Reading';
  if (section.section_type === 'starter') return 'Starter';
  if (section.section_type === 'module') return `Module ${section.section_number}`;
  if (section.section_type === 'unit') return `Unit ${section.section_number}`;
  return '';
}

export function courseSectionDisplayLabel(section) {
  const structuralLabel = courseSectionStructuralLabel(section);
  if (!structuralLabel) return '';
  const displayTitle = section.display_title?.trim();
  return displayTitle ? `${structuralLabel} · ${displayTitle}` : structuralLabel;
}
