import { substitutionName, substitutionCodes } from './substitutionLabels.ts';
import { zipFiles } from './menuExport.ts';
export const rosterDays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
type Student = { id: string; name: string; classroom: string; daycare: string; active: boolean; service_days: string[] };
type Sub = { student: string; daycare: string; recurring: boolean; weekday: string; code: string };
export function rosterRows(students: Student[], classrooms: { id: string; name: string }[], subs: Sub[], school: string, includePast = false, names: Record<string, string> = {}): string[][] {
  return students.filter(s => (includePast || s.active) && s.daycare === school).map(s => [classrooms.find(c => c.id === s.classroom)?.name || 'Unassigned', s.name, ...rosterDays.map(day => {
    if (!s.service_days.includes(day)) return 'No';
    const sub = subs.find(r => r.daycare === school && r.student === s.id && r.recurring && r.weekday === day);
    return sub ? `Sub ${substitutionName({ sub_option_names: names }, sub.code)}` : 'Yes';
  })]);
}
const headers = ['Classroom','Name',...rosterDays];
const escape = (s: string) => s.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function rosterCsv(rows: string[][]): Blob {
  const safe = (v: string) => '"'+(/^[\s]*[=+@-]/.test(v) ? "'"+v : v).replace(/"/g,'""')+'"';
  return new Blob(['\uFEFF'+[headers,...rows].map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
}
export function rosterHtml(school: string, rows: string[][]): string {
 return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(school)} Student Roster</title><style>@page{size:letter landscape;margin:.4in}*{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}body{font-family:Arial,sans-serif;color:#35443a;margin:24px}h1{font-size:22px;margin:0 0 6px}p{font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:8px;border:1px solid #d9e0da;text-align:center}td:nth-child(-n+2),th:nth-child(-n+2){text-align:left}th{background:#e7eee8}tr{break-inside:avoid}.yes{background:#e2efda}.no{background:#fce4d6}.sub{background:#fff2cc}@media print{body{margin:0}thead{display:table-header-group}}</style></head><body><h1>${escape(school)} Student Roster</h1><p>${rows.length} students · Yes: standard lunch · No: no lunch · Sub: substitution</p><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td class="${i<2?'':v==='Yes'?'yes':v==='No'?'no':'sub'}">${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}
export function rosterExcel(_school: string, rows: string[][], names: Record<string, string> = {}): Blob {
 const enc=new TextEncoder(), files:Record<string,Uint8Array>={}; const add=(name:string,s:string)=>files[name]=enc.encode(s);
 const choices=['Yes','No',...substitutionCodes.map(code => `Sub ${substitutionName({ sub_option_names: names }, code)}`)];
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const xmlRows=[headers,...rows].map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${String.fromCharCode(65+c)}${r+1}" t="inlineStr" s="${r===0?1:c<2?0:v==='Yes'?2:v==='No'?3:4}"><is><t xml:space="preserve">${escape(v)}</t></is></c>`).join('')}</row>`).join('');
 const end=Math.max(2,rows.length+1);
 add('xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="2" width="26" customWidth="1"/><col min="3" max="7" width="15" customWidth="1"/></cols><sheetData>${xmlRows}</sheetData><autoFilter ref="A1:G${rows.length+1}"/><conditionalFormatting sqref="C2:G${end}">${['Yes','No'].map((v,i)=>`<cfRule type="cellIs" dxfId="${i}" priority="${i+1}" operator="equal"><formula>&quot;${v}&quot;</formula></cfRule>`).join('')}<cfRule type="expression" dxfId="2" priority="3"><formula>LEFT(C2,3)=&quot;Sub&quot;</formula></cfRule></conditionalFormatting><dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="Choose a lunch option" error="Use the dropdown options." sqref="C2:G${end}"><formula1>LunchOptions</formula1></dataValidation></dataValidations></worksheet>`);
 add('xl/worksheets/sheet2.xml',`<worksheet xmlns="${ns}"><sheetData>${choices.map((v,i)=>`<row r="${i+1}"><c r="A${i+1}" t="inlineStr"><is><t>${escape(v)}</t></is></c></row>`).join('')}</sheetData></worksheet>`);
 const fills=['FFFFFF','E7EEE8','E2EFDA','FCE4D6','FFF2CC'];
 add('xl/styles.xml',`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">${fills.map((_,i)=>`<xf numFmtId="0" fontId="${i===1?1:0}" fillId="${i+2}" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="${i<2?'left':'center'}" wrapText="1"/></xf>`).join('')}</cellXfs><dxfs count="3">${fills.slice(2).map(c=>`<dxf><fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor rgb="FF${c}"/></patternFill></fill></dxf>`).join('')}</dxfs></styleSheet>`);
 add('xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Student Roster" sheetId="1" r:id="rId1"/><sheet name="Options" sheetId="2" r:id="rId3" state="hidden"/></sheets><definedNames><definedName name="LunchOptions">Options!$A$1:$A$6</definedName></definedNames></workbook>`);
 const relns='http://schemas.openxmlformats.org/package/2006/relationships',reltype='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
 add('_rels/.rels',`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${reltype}officeDocument" Target="xl/workbook.xml"/></Relationships>`);
 add('xl/_rels/workbook.xml.rels',`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${reltype}worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${reltype}styles" Target="styles.xml"/><Relationship Id="rId3" Type="${reltype}worksheet" Target="worksheets/sheet2.xml"/></Relationships>`);
 add('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
 return new Blob([zipFiles(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
