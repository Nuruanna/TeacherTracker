import grade2 from '../../course-maps/grade-2.json';
import grade3 from '../../course-maps/grade-3.json';
import grade4 from '../../course-maps/grade-4.json';
import grade5 from '../../course-maps/grade-5.json';
import grade8 from '../../course-maps/grade-8.json';

export const courseMaps = { 'grade-2': grade2, 'grade-3': grade3, 'grade-4': grade4, 'grade-5': grade5, 'grade-8': grade8 };
export const getCourseMap = id => courseMaps[id] ?? null;
export const createDefaultCourseMaps = () => JSON.parse(JSON.stringify(courseMaps));
export const courseMapSummary = Object.fromEntries(Object.entries(courseMaps).map(([id, map]) => [id, {
  id, planned: map.items.filter(x => x.type === 'lesson').length, reserve: map.items.filter(x => x.type === 'reserve').length,
}]));
