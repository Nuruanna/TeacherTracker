export const PASTEL_PALETTE=[
 {id:'pink',label:'Pink lilac',background:'#fbedfa',border:'#edb7eb',badge:'#efb8ee',text:'#74146d'},
 {id:'green',label:'Soft green',background:'#eff7e9',border:'#c8dfb8',badge:'#bee3a8',text:'#185f25'},
 {id:'coral',label:'Light coral',background:'#fff0ef',border:'#f4c3bf',badge:'#ffbbb9',text:'#8d2223'},
 {id:'yellow',label:'Warm yellow',background:'#fff8e8',border:'#f2d28d',badge:'#ffd87e',text:'#875000'},
 {id:'blue',label:'Light blue',background:'#ebf6fc',border:'#afd9ee',badge:'#a9dbf2',text:'#174d87'},
 {id:'lavender',label:'Lavender',background:'#f2edff',border:'#d7c5f5',badge:'#cdb7ef',text:'#57358c'},
 {id:'peach',label:'Peach',background:'#fff1e7',border:'#f3c9ac',badge:'#f5c298',text:'#87491e'},
 {id:'mint',label:'Mint',background:'#eaf8f3',border:'#b8dfd1',badge:'#a8dcca',text:'#17634d'},
 {id:'rose',label:'Dusty rose',background:'#fbedef',border:'#e9c0c8',badge:'#e9b2bd',text:'#7e3345'},
 {id:'lilac',label:'Soft lilac',background:'#f7edfb',border:'#dcc1e8',badge:'#d8b5e6',text:'#683778'},
 {id:'aqua',label:'Pale aqua',background:'#eaf8f8',border:'#b7dfe1',badge:'#a9d9dc',text:'#205e65'},
 {id:'sand',label:'Warm sand',background:'#faf4e9',border:'#dfcfaf',badge:'#ddc69e',text:'#6f5731'},
];
export const DEFAULT_GRADE_COLORS={2:'pink',3:'green',4:'coral',5:'yellow',8:'blue'};
export const paletteColor=id=>PASTEL_PALETTE.find(color=>color.id===id)||PASTEL_PALETTE[0];
export const teachingGroupColorStyle=group=>{const color=paletteColor(group?.color);return {'--grade-bg':color.background,'--grade-border':color.border,'--badge-bg':color.badge,'--grade-text':color.text};};
