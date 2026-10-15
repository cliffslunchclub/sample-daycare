type Row=Record<string,any>;
export type AuditReferences=Record<string,Row>;
export const auditTypes:Record<string,string>={students:'Student',classrooms:'Classroom',daycares:'School Settings',substitutions:'Substitution',menu_days:'Menu',menu_items:'Menu Item',users:'Admin Account',lunch_requests:'Note / Lunch Request',school_notes:'School Note',invoices:'Invoice',invoice_flags:'Invoice Correction'};
export const auditRelations:Record<string,string>={daycare:'daycares',classroom:'classrooms',student:'students',created_by:'users',admin:'users',user:'users',menu_item:'menu_items',invoice:'invoices',invoice_id:'invoices'};
const relationNouns:Record<string,string>={daycares:'school',classrooms:'classroom',students:'student',users:'account',menu_items:'menu item',invoices:'invoice'};
const fieldNames:Record<string,string>={daycare:'School',classroom:'Classroom',student:'Student',code:'Substitution Option',pizza_substitution:'Replaces Friday Pizza',recurring:'Repeats Every Week',service_date:'Lunch Date',service_dates:'Lunch Dates',weekday:'Day of the Week',service_days:'Weekly Lunch Days',last_lunch_date:'Last Lunch Date',billing_effective_date:'Effective Date',invoice_rate:'Meal Rate',baseline_counts:'Scheduled Lunch Counts',baseline_pizza_counts:'Scheduled Pizza Counts',clc_managed_counts:'CLC-Managed Lunch Counts',sizes_enabled:'Classroom Meal Sizes Enabled',operations_enabled:'Roster Tools Enabled',allow_substitutions:'Substitutions Enabled',count_mode:'Counting Method',billing_cycle:'Billing Schedule',billing_anchor:'First Billing Period',public_slug:'School Menu Address',clc_managed:'Managed by CLC',active:'Active',display_name:'Display Name',created_by:'Submitted By',role:'Account Type',kind:'Entry Type',size:'Meal Size',meal_size:'Classroom Meal Size',age_order:'Classroom Sort Order',status:'Status',student_label:'Student Name',classroom_label:'Classroom Name',note:'Note',response:'Response',menu:'Lunch Menu',closed:'No Lunch Service',published:'Public Menu',pizza_count:'Pizza Count',invoice_id:'Invoice',account_access:'Account Access',email:'Email Address',name:'Name',period_start:'Service Period Start',period_end:'Service Period End',invoice_date:'Invoice Date',due_date:'Due Date',month:'Invoice Month',show_payment_terms:'Show Due Date and Terms',subtotal_cents:'Subtotal',tax_cents:'Tax',total_cents:'Total',sub_a_label:'Option A Description',sub_b_label:'Option B Description',sub_c_label:'Option C Description',sub_v_label:'Option V Description'};
const words:Record<string,string>={clc_admin:'CLC Administrator',daycare_admin:'School Administrator',roster:'Student Roster',manual:'Saved Weekday Counts',monthly:'Monthly',biweekly:'Every Two Weeks',note:'General Note',lunch:'One-off Lunch Request',small:'Small',large:'Large',standard:'Standard',pending:'Pending Review',approved:'Approved',rejected:'Rejected',new:'New',acknowledged:'Acknowledged',resolved:'Resolved',deleted:'Removed',draft:'Draft',issued:'Issued',open:'Open',paid:'Paid'};
export function auditField(key:string){return fieldNames[key]||key.replace(/_/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());}
export function auditDate(value:any){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);return match?`${match[2]}-${match[3]}-${match[1]}`:String(value||'');}
export function referenceName(table:string,id:any,row:Row,refs:AuditReferences){
 const ref=refs[`${table}:${id}:${row.daycare}`]||refs[`${table}:${id}`];
 if(!ref || (table!=='daycares' && String(ref.daycare||'')!==String(row.daycare||'')))return '';
 return ref.name||ref.display_name||ref.student_label||ref.number||ref.email||'';
}
export function auditValue(value:any,key='',row:Row={},refs:AuditReferences={},side?:'before'|'after'):string{
 if(value===null||value===undefined||value==='')return '—';
 const saved=side && row.changes?.[key]?.[side+'_label'];if(saved)return String(saved);
 if(auditRelations[key] && /^[a-z0-9]{15}$/.test(String(value)))return referenceName(auditRelations[key],value,row,refs)||`Deleted or unavailable ${relationNouns[auditRelations[key]]||'record'}`;
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='number' && (key==='invoice_rate'||key.endsWith('_cents')))return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(key.endsWith('_cents')?value/100:value);
 if(Array.isArray(value))return value.length?value.map(item=>auditValue(item,key,row,refs)).join(', '):'None';
 if(typeof value==='object')return Object.entries(value).map(([name,entry])=>`${auditField(name)}: ${auditValue(entry,name,row,refs)}`).join('; ')||'None';
 if(/^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(String(value)))return auditDate(value);
 if(key==='month'&&/^\d{4}-\d{2}$/.test(String(value))){const[y,m]=String(value).split('-');return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(Number(y),Number(m)-1,1));}
 if(key==='public_slug'){const hosts:Record<string,string>={'lightbridge-bergenfield':'lba-bf','lightbridge-fort-lee':'lba-fl','tle-englewood-cliffs':'tle-ec'};return hosts[String(value)]?`https://${hosts[String(value)]}.cliffslunchclub.com`:String(value);}
 if(key==='code') {const school=refs[`daycares:${row.daycare}`],description=school?.[`sub_${String(value).toLowerCase()}_label`];return String(value)+(description?' — '+description:'');}
 if(['role','kind','count_mode','billing_cycle','status','size','meal_size'].includes(key))return words[String(value)]||String(value).replace(/_/g,' ');
 return String(value);
}
function value(row:Row,key:string,side:'before'|'after',refs:AuditReferences){return auditValue(row.changes?.[key]?.[side],key,row,refs,side);}
export function auditSummary(row:Row,refs:AuditReferences={}):string{
 if(row.changes?.__undo?.summary)return row.changes.__undo.summary;
 const changes=row.changes||{},side=row.action==='delete'?'before':'after',meta=changes.__display?.[side]||{};
 const live=refs[`${row.entity_type}:${row.entity_id}:${row.daycare}`]||refs[`${row.entity_type}:${row.entity_id}`];const context=live && String(live.daycare||'')===String(row.daycare||'')?live:{};
 const ownLabel=row.entity_label&&row.entity_label!==row.entity_id&&!/^\d{4}-\d{2}/.test(row.entity_label)?row.entity_label:'';
 const name=meta.subject||changes.name?.[side]||changes.display_name?.[side]||changes.student_label?.[side]||ownLabel||context.name||context.display_name||'';
 const student=meta.subject||(['before','after'] as const).map(s=>changes.student?.[s+'_label']||referenceName('students',changes.student?.[s],row,refs)).find(Boolean)||referenceName('students',context.student,row,refs)||'';
 const weekday=meta.weekday||changes.weekday?.[side]||'';
 const date=auditDate(meta.service_date||changes.service_date?.[side]||(/^(\d{4}-\d{2}-\d{2})/.test(row.entity_label||'')?row.entity_label:''));
 const school=row.school_name||'the school';const verb=row.action==='create'?'Added':row.action==='delete'?'Removed':'Updated';
 if(row.entity_type==='students'){
  const who=name||'a student';
  const room=meta.classroom||changes.classroom?.after_label||referenceName('classrooms',changes.classroom?.after,row,refs);
  if(row.action==='create')return `Added ${who}${room?' to '+room:''}`;
  if(row.action==='delete'||changes.active?.after===false)return `Removed ${who} from the roster`;
  if(changes.last_lunch_date)return changes.last_lunch_date.after ? `Set ${who}’s last lunch date to ${value(row,'last_lunch_date','after',refs)}` : `Cleared ${who}’s last lunch date`;
  if(changes.classroom)return `Moved ${who} from ${value(row,'classroom','before',refs)} to ${value(row,'classroom','after',refs)}`;
  if(changes.service_days)return `Changed ${who}’s lunch days from ${value(row,'service_days','before',refs)} to ${value(row,'service_days','after',refs)}`;
  if(changes.name)return `Renamed ${value(row,'name','before',refs)} to ${value(row,'name','after',refs)}`;
  return `${verb} ${who}’s student information`;
 }
 if(row.entity_type==='substitutions')return `${verb} ${student?student+'’s':'a'}${weekday?' '+weekday:''} substitution`;
 if(row.entity_type==='classrooms')return `${verb} ${name||'a classroom'}${changes.meal_size&&row.action==='update'?' · Meal size changed from '+value(row,'meal_size','before',refs)+' to '+value(row,'meal_size','after',refs):''}`;
 if(row.entity_type==='menu_days')return `${row.action==='delete'?'Removed':changes.closed?.after===true?'Marked as no lunch service:':changes.published?.after===true&&row.action==='update'?'Published':'Updated'} ${school}’s menu${date?' for '+date:''}`;
 if(row.entity_type==='menu_items')return `${row.action==='update'&&changes.active?.after===false?'Archived':verb} menu item${name?': '+name:''}`;
 if(row.entity_type==='users')return `${changes.active&&row.action==='update'?(changes.active.after?'Enabled':'Disabled'):row.action==='create'?'Created':verb} admin account${name?' for '+name:''}`;
 if(row.entity_type==='daycares'&&changes.invoice_rate&&row.action==='update')return `Changed ${school}’s meal rate from ${value(row,'invoice_rate','before',refs)} to ${value(row,'invoice_rate','after',refs)}`;
 if(row.entity_type==='daycares')return `${verb} ${school}’s settings`;
 if(row.entity_type==='lunch_requests'){const kind=meta.kind||changes.kind?.[side]||context.kind;return `${verb} ${kind==='lunch'?'lunch request'+(name?' for '+name:'')+(date?' on '+date:''):'a note for '+school}`;}
 if(row.entity_type==='school_notes')return `${verb} a school note for ${school}`;
 return `${verb} ${auditTypes[row.entity_type]?.toLowerCase()||'record'}${name?': '+name:''}`;
}
