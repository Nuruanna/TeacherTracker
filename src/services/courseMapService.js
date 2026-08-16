const clone=value=>JSON.parse(JSON.stringify(value));
const ITEM_TYPES=new Set(['lesson','reserve']);
const normalizeItems=items=>items.map((item,index)=>({...item,order:index+1}));

export function validateCourseMap(input){
 const errors=[];
 if(!input||typeof input!=='object') return {valid:false,errors:['Course Map must be an object.']};
 if(typeof input.courseMapId!=='string'||!input.courseMapId.trim()) errors.push('courseMapId is required.');
 if(!Number.isInteger(input.grade)||input.grade<1) errors.push('grade must be a positive integer.');
 if(typeof input.textbook!=='string'||!input.textbook.trim()) errors.push('textbook is required.');
 if(input.reserveScope!=='annual') errors.push('reserveScope must be annual.');
 if(!Array.isArray(input.items)) errors.push('items must be an array.');
 const ids=new Set(),orders=new Set();
 for(const item of input.items||[]){
  if(typeof item.id!=='string'||!item.id.trim()) errors.push('Every item needs an id.');
  else if(ids.has(item.id)) errors.push(`Duplicate item id: ${item.id}.`); else ids.add(item.id);
  if(!Number.isFinite(item.order)||item.order<1) errors.push(`Item ${item.id||'?'} needs a positive order.`);
  else if(orders.has(item.order)) errors.push(`Duplicate item order: ${item.order}.`); else orders.add(item.order);
  if(!ITEM_TYPES.has(item.type)) errors.push(`Unsupported item type: ${item.type}.`);
  if(typeof item.code!=='string'||!item.code.trim()) errors.push(`Item ${item.id||'?'} needs a code.`);
  if(item.type==='lesson'&&item.title!==null&&typeof item.title!=='string') errors.push(`Invalid title for ${item.id||'item'}.`);
 }
 return {valid:errors.length===0,errors};
}

const withCounts=map=>{const items=normalizeItems(map.items);return {...map,items,plannedItemCount:items.filter(x=>x.type==='lesson').length,reserveCount:items.filter(x=>x.type==='reserve').length,totalItemCount:items.length,reserveScope:'annual'};};
export const courseMapPreview=map=>({lessons:map.items.filter(x=>x.type==='lesson').length,reserve:map.items.filter(x=>x.type==='reserve').length,total:map.items.length});
export const exportCourseMap=(state,id)=>JSON.stringify(state.courseMaps[id],null,2);

export function importCourseMap(json,expectedId){
 let parsed;
 try{parsed=typeof json==='string'?JSON.parse(json):clone(json);}catch{return {valid:false,errors:['Invalid JSON.'],courseMap:null};}
 const validation=validateCourseMap(parsed);
 if(expectedId&&parsed.courseMapId!==expectedId) validation.errors.push(`Expected ${expectedId}, received ${parsed.courseMapId||'unknown'}.`);
 validation.valid=validation.errors.length===0;
 return {...validation,courseMap:validation.valid?withCounts(parsed):null};
}

export function replaceCourseMap(state,id,input){
 const result=importCourseMap(input,id);
 if(!result.valid) throw new Error(result.errors.join(' '));
 const teachingGroupCourseStates=Object.fromEntries(Object.entries(state.teachingGroupCourseStates||{}).map(([groupId,courseState])=>[groupId,courseState.courseMapId===id?{...courseState,lessonAssignments:{},recalculationRequired:true}:courseState]));
 return {...state,courseMaps:{...state.courseMaps,[id]:result.courseMap},teachingGroupCourseStates};
}

function updateMap(state,id,updater){
 const current=state.courseMaps[id]; if(!current) throw new Error(`Unknown Course Map: ${id}`);
 return {...state,courseMaps:{...state.courseMaps,[id]:withCounts({...current,items:updater(clone(current.items))})}};
}
export const renameCourseMapItem=(state,id,itemId,title)=>updateMap(state,id,items=>items.map(x=>x.id===itemId?{...x,title}:x));
export const addCourseMapItem=(state,id,item,index)=>updateMap(state,id,items=>{if(items.some(x=>x.id===item.id))throw new Error(`Duplicate item id: ${item.id}`);items.splice(index??items.length,0,{...item,type:item.type||'lesson'});return items;});
export const deleteCourseMapItem=(state,id,itemId)=>updateMap(state,id,items=>items.filter(x=>x.id!==itemId));
export const reorderCourseMapItem=(state,id,itemId,toIndex)=>updateMap(state,id,items=>{const from=items.findIndex(x=>x.id===itemId);if(from<0)throw new Error(`Unknown item: ${itemId}`);const [item]=items.splice(from,1);items.splice(Math.max(0,Math.min(toIndex,items.length)),0,item);return items;});
export const setCourseMapItemType=(state,id,itemId,type)=>{if(!ITEM_TYPES.has(type))throw new Error(`Unsupported item type: ${type}`);return updateMap(state,id,items=>items.map(x=>x.id===itemId?{...x,type,title:type==='reserve'?null:x.title}:x));};
