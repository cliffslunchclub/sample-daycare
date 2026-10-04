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
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${c.off ? '#f4cccc' : '#d9ead3'}" class="date ${c.off ? 'off' : ''}">${c.date}</td>`).join('')}</tr>`);
    rows.push(`<tr>${cells.map((c) => `<td bgcolor="${c.off ? '#f4cccc' : '#fff2cc'}" class="meal ${c.off ? 'off' : ''}">${c.inside ? c.meal.closed ? 'No lunch service' : escapeHtml(c.meal.menu || 'Menu will be posted soon').replace(/\r?\n/g, '<br>') : '&nbsp;'}${c.inside && c.meal.note ? `<br><span class="note">${escapeHtml(c.meal.note).replace(/\r?\n/g, '<br>')}</span>` : ''}</td>`).join('')}</tr>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(school)} ${label} menu</title><style>
  @page{size:letter landscape;margin:.35in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{text-align:center;font-size:18pt;margin:0 0 5pt}h2{text-align:center;font-size:13pt;margin:0 0 12pt}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:10pt}th,td{border:1px solid #111;text-align:center;width:20%;padding:4pt;vertical-align:middle}th{background:#1c528e;color:#fff;font-weight:bold}.date{background:#d9ead3;font-size:9pt;font-weight:bold;padding:3pt}.meal{background:#fff2cc;height:49pt;font-weight:bold;overflow-wrap:anywhere}.off{background:#f4cccc}.note{font-size:9pt;font-weight:normal}tr{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h1>${escapeHtml(school)}</h1><h2>${label} Lunch Menu</h2><table><thead><tr>${['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day) => `<th bgcolor="#1c528e">${day}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;
}

export function printMenuHtml(html: string) {
  const preview = window.open('', '_blank');
  if (!preview) { window.alert('Allow pop-ups to open the printable menu.'); return; }
  preview.addEventListener('load', () => { preview.focus(); preview.print(); }, { once: true });
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
}
