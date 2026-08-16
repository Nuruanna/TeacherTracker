import { createDefaultCourseMaps } from './courseMaps';

export const academicYear={start:'2026-01-01',end:'2026-12-31'};
const gradeSettings={
 2:{textbook:'Spotlight 2',courseMapId:'grade-2',color:'pink'},
 3:{textbook:'Spotlight 3',courseMapId:'grade-3',color:'green'},
 4:{textbook:'Spotlight 4',courseMapId:'grade-4',color:'coral'},
 5:{textbook:'Rainbow English 5',courseMapId:'grade-5',color:'yellow'},
 8:{textbook:'Rainbow English 8',courseMapId:'grade-8',color:'blue'},
};
const classGroup=(grade,letter,id)=>({id,type:'class',grade,section:letter,displayName:`${grade}${letter}`,...gradeSettings[grade],activeFrom:academicYear.start,archivedAt:null});
export const teachingGroups=[
 classGroup(2,'А','grade2-a'),classGroup(2,'Б','grade2-b'),classGroup(2,'В','grade2-v'),
 classGroup(3,'А','grade3-a'),classGroup(3,'Б','grade3-b'),classGroup(3,'В','grade3-v'),
 classGroup(4,'А','grade4-a'),classGroup(4,'Б','grade4-b'),classGroup(4,'В','grade4-v'),
 classGroup(5,'А','grade5-a'),classGroup(5,'Б','grade5-b'),classGroup(5,'В','grade5-v'),
 classGroup(8,'А','grade8-a'),
];

export const defaultBellSchedule={id:'bells-2026-01-01',effectiveFrom:academicYear.start,slots:[
 {lessonNumber:1,startTime:'08:30',endTime:'09:10'},{lessonNumber:2,startTime:'09:20',endTime:'10:00'},
 {lessonNumber:3,startTime:'10:15',endTime:'10:55'},{lessonNumber:4,startTime:'11:10',endTime:'11:50'},
 {lessonNumber:5,startTime:'12:00',endTime:'12:40'},{lessonNumber:6,startTime:'13:00',endTime:'13:40'},
 {lessonNumber:7,startTime:'13:50',endTime:'14:30'},
]};
const timetableByGroup={
 'grade2-a':[['Wednesday',4],['Thursday',3]],'grade2-b':[['Wednesday',3],['Thursday',2]],'grade2-v':[['Wednesday',2],['Thursday',1]],
 'grade3-a':[['Monday',5],['Tuesday',4]],'grade3-b':[['Tuesday',5],['Friday',5]],'grade3-v':[['Tuesday',3],['Friday',2]],
 'grade4-a':[['Wednesday',1],['Friday',1]],'grade4-b':[['Wednesday',5],['Friday',4]],'grade4-v':[['Tuesday',1],['Thursday',4]],
 'grade5-a':[['Monday',3],['Tuesday',2]],'grade5-b':[['Monday',4],['Tuesday',6]],'grade5-v':[['Monday',6],['Thursday',5]],
 'grade8-a':[['Tuesday',7],['Wednesday',6],['Friday',7]],
};
export const defaultWeeklyTimetable=Object.entries(timetableByGroup).flatMap(([teachingGroupId,slots])=>slots.map(([day,lessonNumber])=>({id:`${teachingGroupId}-${day.toLowerCase()}-${lessonNumber}`,day,lessonNumber,teachingGroupId})));

const courseState=group=>({teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]});
export const seedState={
 schemaVersion:10,
 teachingGroups,
 bellSchedules:[defaultBellSchedule],
 weeklyTimetable:defaultWeeklyTimetable,
 courseMaps:createDefaultCourseMaps(),
 academicCalendar:{academicYear,schoolBreaks:[],noSchoolDays:[],excludedDates:[]},
 teachingGroupCourseStates:Object.fromEntries(teachingGroups.map(group=>[group.id,courseState(group)])),
 lessons:[],notes:{},homeworkMaterials:[],statusChanges:[],
};
