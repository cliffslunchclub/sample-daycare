import { invoiceDate } from "./invoicePdf.ts";
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
      return { date: invoiceDate(isoDate(date)), inside, off, meal };
    });
    // A month starting on a weekend has no dates in its first weekday row.
    if (!cells.some((cell) => cell.inside)) continue;
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${!c.inside ? '#f0f1f0' : c.off ? '#f0f1f0' : '#ffffff'}" class="date ${!c.inside ? 'outside' : c.off ? 'off' : ''}">${c.date}</td>`).join('')}</tr>`);
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${!c.inside ? '#f0f1f0' : c.off ? '#f0f1f0' : '#ffffff'}" class="meal ${!c.inside ? 'outside' : c.off ? 'off' : ''}">${c.inside ? c.meal.closed ? '<strong>No Lunch Service</strong>' : escapeHtml(c.meal.menu || 'Menu will be posted soon').replace(/\r?\n/g, '<br>') : '&nbsp;'}${c.inside && c.meal.note ? `<br><span class="note">${escapeHtml(c.meal.note).replace(/\r?\n/g, '<br>')}</span>` : ''}</td>`).join('')}</tr>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(school)} ${label} menu</title><style>
  @page{size:letter landscape;margin:.35in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{text-align:left;font-size:18pt;margin:0 0 5pt}h2{text-align:left;font-size:13pt;margin:0 0 12pt}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:10pt}th,td{border:1px solid #d9e0da;text-align:center;width:20%;padding:4pt;vertical-align:middle}th{background:#e7eee8;color:#35443a;font-weight:bold}.date{background:#ffffff;font-size:9pt;font-weight:bold;padding:3pt}.meal{background:#ffffff;height:49pt;font-weight:normal;overflow-wrap:anywhere}.off{background:#f0f1f0}.outside{background:#eee;color:#888}.note{font-size:9pt;font-weight:normal}tr{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@media screen{html{background:#f4f6f3}body{width:calc(100% - 64px);max-width:1180px;margin:32px auto;padding:32px;background:#fff;border:1px solid #d9e0da;border-radius:12px;box-shadow:0 4px 20px #24382a0a}h2{margin-bottom:20px}th,td{padding:8px}.meal{height:76px}}@media screen and (max-width:640px){body{width:calc(100% - 24px);margin:12px auto;padding:16px;overflow-x:auto}table{min-width:720px}}</style></head><body><div style="font-size:10pt;font-weight:bold;color:#5b8067;margin-bottom:5pt">CLIFFS LUNCH CLUB</div><h1>${escapeHtml(school)}</h1><h2>${label} Lunch Menu</h2><table><thead><tr>${['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day) => `<th bgcolor="#e7eee8">${day}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table><div style="display:flex;justify-content:space-between;border-top:1px solid #5b8067;margin-top:10pt;padding-top:6pt;font-size:8pt;color:#64716c"><span>Menus are subject to change.</span><span>Cliffs Lunch Club</span></div></body></html>`;
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

export function zipFiles(files: Record<string, Uint8Array>): Uint8Array {
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
  const paragraph = (text: string, size = 18, color = '35443a', bold = true, align = 'center') => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold?'<w:b/>':''}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>${text.split(/\r?\n/).map((line,i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeHtml(line)}</w:t>`).join('')}</w:r></w:p>`;
  const cell = (text: string, fill: string, color = '35443a', bold = true) => `<w:tc><w:tcPr><w:tcW w:w="2160" w:type="dxa"/><w:shd w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>${paragraph(text,18,color,bold)}</w:tc>`;
  const first = new Date(`${month}-01T00:00:00Z`), last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1,0));
  const monday = new Date(first); monday.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  let rows = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="320"/><w:cantSplit/></w:trPr>${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => cell(day,'e7eee8','35443a')).join('')}</w:tr>`;
  for (let start=monday.getTime();start<=last.getTime();start+=7*86400000) {
    const days = Array.from({length:5},(_,i)=>new Date(start+i*86400000));
    if (!days.some(date=>isoDate(date).startsWith(month))) continue;
    rows += `<w:tr><w:trPr><w:trHeight w:val="260"/><w:cantSplit/></w:trPr>${days.map(date=>{const inside=isoDate(date).startsWith(month), meal=inside?mealFor(isoDate(date)):{};return cell(invoiceDate(isoDate(date)),!inside?'f0f1f0':meal.closed?'f0f1f0':'FFFFFF',!inside||meal.closed?'64716c':'35443a',true);}).join('')}</w:tr>`;
    rows += `<w:tr><w:trPr><w:trHeight w:val="780" w:hRule="atLeast"/><w:cantSplit/></w:trPr>${days.map(date=>{const inside=isoDate(date).startsWith(month), meal=inside?mealFor(isoDate(date)):{};return cell(inside?(meal.closed?'No Lunch Service':meal.menu||'Menu will be posted soon')+(meal.note?`\n${meal.note}`:''):'',!inside?'f0f1f0':meal.closed?'f0f1f0':'FFFFFF',!inside||meal.closed?'64716c':'35443a',!!meal.closed);}).join('')}</w:tr>`;
  }
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const borders = ['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="d9e0da"/>`).join('');
  const label = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
  const files: Record<string,Uint8Array> = {};
  files['word/header1.xml']=xml(`<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${w}">${paragraph("CLIFFS LUNCH CLUB",20,"5b8067",true,"left")}${paragraph(school,36,"35443a",true,"left")}${paragraph(`${label} Lunch Menu`,26,"35443a",false,"left")}</w:hdr>`);
  files['word/document.xml']=xml(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:tbl><w:tblPr><w:tblW w:w="10800" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2160"/>'.repeat(5)}</w:tblGrid>${rows}</w:tbl>${paragraph("Menus are subject to change. | Cliffs Lunch Club",16,"64716c",false,"left")}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/><w:pgMar w:top="1650" w:right="720" w:bottom="720" w:left="720" w:header="500" w:footer="500"/></w:sectPr></w:body></w:document>`);
  files['word/_rels/document.xml.rels']=xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
  files['_rels/.rels']=xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  files['[Content_Types].xml']=xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
  return new Blob([zipFiles(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

export function menuOverviewHtml(month: string, schools: { name: string; mealFor: (date: string) => (Meal & { published?: boolean }) | undefined }[]): string {
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const calendars = schools.map(school => {
    // Reuse the weekday alignment and escaped text of the individual menu export.
    const html = menuExportHtml(school.name, month, date => {
      const saved = school.mealFor(date);
      return saved ? { ...saved, note: [saved.note, !saved.published ? 'Draft' : ''].filter(Boolean).join('\n') } : { menu: 'Not saved' };
    });
    const table = html.slice(html.indexOf('<table>'), html.indexOf('</table>') + 8);
    return `<section><h2>${escapeHtml(school.name)}</h2>${table}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Internal Menu Overview ${escapeHtml(label)}</title><style>
  @page{size:letter portrait;margin:.35in}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;font-family:Arial,sans-serif;color:#35443a}.sheet{width:7.8in;transform-origin:top left}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #5b8067;padding-bottom:5pt;margin-bottom:7pt}h1{font-size:14pt;margin:0}header span{font-size:9pt}h2{font-size:10pt;margin:0 0 4pt}section{margin-bottom:8pt;break-inside:avoid}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:8pt}td,th{border:1px solid #d9e0da;text-align:center;padding:2pt;width:20%;overflow-wrap:anywhere}th{background:#e7eee8;font-size:8pt}.date{font-size:7pt;font-weight:bold;padding:1pt}.meal{height:25pt;line-height:1.12}.note{font-size:7pt;color:#64716c}.off,.outside{background:#f0f1f0}.outside{color:#888}footer{font-size:7pt;color:#64716c} @media screen{body{background:#f4f6f3;padding:24px}.sheet{background:white;padding:18px;width:8.5in;margin:auto;box-shadow:0 3px 18px #24382a15}}
  </style></head><body><main class="sheet"><header><h1>Menu Overview</h1><span>${escapeHtml(label)} · Internal use</span></header>${calendars}<footer>Saved menus only · Draft indicates an unpublished day · Menus are subject to change</footer></main><script>
  function fit(){const sheet=document.querySelector('.sheet');sheet.style.zoom='1';const max=10.25*96;const height=sheet.scrollHeight;const scale=Math.min(1,max/height);sheet.style.zoom=String(scale);document.body.style.height=(height*scale)+'px';}
  window.addEventListener('beforeprint',fit);window.addEventListener('afterprint',()=>{document.querySelector('.sheet').style.zoom='1';document.body.style.height='';});
  </script></body></html>`;
}
