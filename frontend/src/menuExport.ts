import { menuTemplate } from "./menuTemplate.ts";
type Meal = { menu?: string; note?: string; closed?: boolean };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function menuExportHtml(school: string, month: string, mealFor: (date: string) => Meal): string {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const last = new Date(Date.UTC(year, number, 0));
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const rows: string[] = [];
  for (let start = monday.getTime(); start <= last.getTime(); start += 7 * 86400000) {
    const cells = Array.from({ length: 5 }, (_, i) => {
      const date = new Date(start + i * 86400000);
      const inside = isoDate(date).startsWith(month);
      const meal = inside ? mealFor(isoDate(date)) : {};
      const off = !inside || Boolean(meal.closed);
      return { date: `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(-2)}`, inside, off, meal };
    });
    // A month starting on a weekend has no dates in its first weekday row.
    if (!cells.some((cell) => cell.inside)) continue;
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${!c.inside ? '#eeeeee' : c.off ? '#f4cccc' : '#d9ead3'}" class="date ${!c.inside ? 'outside' : c.off ? 'off' : ''}">${c.date}</td>`).join('')}</tr>`);
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${!c.inside ? '#eeeeee' : c.off ? '#f4cccc' : '#fff2cc'}" class="meal ${!c.inside ? 'outside' : c.off ? 'off' : ''}">${c.inside ? c.meal.closed ? 'No lunch service' : escapeHtml(c.meal.menu || 'Menu will be posted soon').replace(/\r?\n/g, '<br>') : '&nbsp;'}${c.inside && c.meal.note ? `<br><span class="note">${escapeHtml(c.meal.note).replace(/\r?\n/g, '<br>')}</span>` : ''}</td>`).join('')}</tr>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(school)} ${label} menu</title><style>
  @page{size:letter landscape;margin:.35in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{text-align:center;font-size:18pt;margin:0 0 5pt}h2{text-align:center;font-size:13pt;margin:0 0 12pt}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:10pt}th,td{border:1px solid #111;text-align:center;width:20%;padding:4pt;vertical-align:middle}th{background:#1c528e;color:#fff;font-weight:bold}.date{background:#d9ead3;font-size:9pt;font-weight:bold;padding:3pt}.meal{background:#fff2cc;height:49pt;font-weight:bold;overflow-wrap:anywhere}.off{background:#f4cccc}.outside{background:#eee;color:#888}.note{font-size:9pt;font-weight:normal}tr{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h1>${escapeHtml(school)}</h1><h2>${label} Lunch Menu</h2><table><thead><tr>${['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day) => `<th bgcolor="#1c528e">${day}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;
}

export function printMenuHtml(html: string) {
  const preview = window.open('', '_blank');
  if (!preview) { window.alert('Allow pop-ups to open the printable menu.'); return; }
  preview.addEventListener('load', () => { preview.focus(); preview.print(); }, { once: true });
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
}

// Minimal uncompressed OOXML package: editable Word calendar with the reference logos.
export function menuFilename(school: string, month: string) {
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  return `${school.replace(/[^a-zA-Z0-9 -]/g, '')} Menu ${label}.docx`;
}

function zipFiles(files: Record<string, Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  const header = (size: number) => new Uint8Array(size);
  const crc = (bytes: Uint8Array) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  for (const [path, bytes] of Object.entries(files)) {
    const name = encoder.encode(path), sum = crc(bytes);
    const local = header(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(14, sum, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, name.length, true);
    chunks.push(local, name, bytes);
    const central = header(46), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, sum, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    directory.push(central, name); offset += local.length + name.length + bytes.length;
  }
  const dirSize = directory.reduce((sum, part) => sum + part.length, 0), end = header(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, Object.keys(files).length, true); ev.setUint16(10, Object.keys(files).length, true); ev.setUint32(12, dirSize, true); ev.setUint32(16, offset, true);
  const all = [...chunks, ...directory, end], output = new Uint8Array(offset + dirSize + end.length);
  let index = 0; for (const part of all) { output.set(part, index); index += part.length; } return output;
}

export function menuExportDocx(school: string, month: string, mealFor: (date: string) => Meal): Blob {
  const encoder = new TextEncoder();
  const xml = (text: string) => encoder.encode(text);
  const paragraph = (text: string, size = 18, color = '000000') => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>${text.split(/\r?\n/).map((line,i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeHtml(line)}</w:t>`).join('')}</w:r></w:p>`;
  const cell = (text: string, fill: string, color = '000000') => `<w:tc><w:tcPr><w:tcW w:w="2160" w:type="dxa"/><w:shd w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>${paragraph(text,18,color)}</w:tc>`;
  const first = new Date(`${month}-01T00:00:00Z`), last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1,0));
  const monday = new Date(first); monday.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  let rows = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="320"/><w:cantSplit/></w:trPr>${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => cell(day,'0b5394','FFFFFF')).join('')}</w:tr>`;
  for (let start=monday.getTime();start<=last.getTime();start+=7*86400000) {
    const days = Array.from({length:5},(_,i)=>new Date(start+i*86400000));
    if (!days.some(date=>isoDate(date).startsWith(month))) continue;
    rows += `<w:tr><w:trPr><w:trHeight w:val="260"/><w:cantSplit/></w:trPr>${days.map(date=>{const inside=isoDate(date).startsWith(month), meal=inside?mealFor(isoDate(date)):{};return cell(`${date.getUTCMonth()+1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(-2)}`,!inside?'eeeeee':meal.closed?'f4cccc':'d9ead3');}).join('')}</w:tr>`;
    rows += `<w:tr><w:trPr><w:trHeight w:val="780" w:hRule="atLeast"/><w:cantSplit/></w:trPr>${days.map(date=>{const inside=isoDate(date).startsWith(month), meal=inside?mealFor(isoDate(date)):{};return cell(inside?(meal.closed?'No lunch service':meal.menu||'Menu will be posted soon')+(meal.note?`\n${meal.note}`:''):'',!inside?'eeeeee':meal.closed?'f4cccc':'fff2cc');}).join('')}</w:tr>`;
  }
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const borders = ['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="000000"/>`).join('');
  const label = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
  const files: Record<string,Uint8Array> = {};
  for (const [path,base64] of Object.entries(menuTemplate)) files[path] = Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  files['word/header1.xml']=xml(`<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${w}">${paragraph(school,36)}${paragraph(`${label} Lunch Menu`,32)}</w:hdr>`);
  files['word/document.xml']=xml(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:tbl><w:tblPr><w:tblW w:w="10800" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2160"/>'.repeat(5)}</w:tblGrid>${rows}</w:tbl><w:p/><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1800" w:right="720" w:bottom="720" w:left="720" w:header="500" w:footer="500"/></w:sectPr></w:body></w:document>`);
  files['word/_rels/document.xml.rels']=xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
  files['_rels/.rels']=xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  files['[Content_Types].xml']=xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
  return new Blob([zipFiles(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
