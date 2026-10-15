export type InvoiceLine = { description: string; quantity: number; rate: number; taxable: boolean; amount_cents?: number; request_id?: string; adjustment_type?: string; baseline?: boolean; pending_source?: string; pending_unit?: string; pending_request?: string; service_dates?: string[]; carry_source?: string; carry_date?: string; carry_snapshot?: {quantity:number;rate:number} };
export type Invoice = { id: string; daycare: string; school_name: string; number: string; month: string; invoice_date: string; billing_cycle?: string; period_start?: string; period_end?: string; due_date?: string; show_payment_terms?: boolean; shared?: boolean; status: string; notes: string; generated_notes?: string; closed_snapshot?: { source_file?: string; recovered_reference?: string }; lines: InvoiceLine[]; daily_counts: {date: string; quantity: number; rate: number; closed: boolean}[]; subtotal_cents: number; tax_cents: number; total_cents: number };
export const showInvoiceTerms = (invoice: Invoice) => invoice.show_payment_terms ?? (invoice.billing_cycle === 'biweekly' || !!invoice.due_date);
export const money = (cents: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents/100);
export const invoiceDate = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(5,7)+'-'+value.slice(8,10)+'-'+value.slice(0,4) : value;
export const invoiceDatesInText = (value: string) => String(value||'').replace(/\s*[-–]\s*baseline\b/gi, '').replace(/\bbaseline:\s*/gi, '').replace(/\bbaseline\s+/gi, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, invoiceDate).replace(/\b(\d{4}-\d{2})(?= Lunch Catering| Additional Adjustment)/g, invoiceMonth);
export const invoiceBreakdownText = (value: string) => invoiceDatesInText(value).split(/\r?\n/).map(line => line.replace(/\.+\s*$/, '')).join('\n');
export const invoiceMonth = (value: string) => /^\d{4}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')) : value;
const literal = (s:string) => s.replace(/[^\x20-\x7e]/g,'-').replace(/[\\()]/g,'\\$&');
const fontWidths = [[278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584], [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]];
const clean = (s:string) => s.replace(/[^\x20-\x7e]/g,'-');
const width = (s:string,size=10,bold=false) => [...clean(s)].reduce((n,c)=>n+fontWidths[bold?1:0][c.charCodeAt(0)-32],0)*size/1000;
export function invoicePdf(invoice:Invoice):Blob {
  const pages:string[]=[];let content='',y=0;
  const ink='0.16 0.18 0.17', muted='0.39 0.43 0.41', green='0.36 0.50 0.40', lineColor='0.83 0.87 0.84';
  const text=(s:string,x:number,yy:number,size=10,bold=false,color=ink)=>{content+=`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${yy} Tm (${literal(s)}) Tj ET\n`;};
  const right=(s:string,x:number,yy:number,size=10,bold=false)=>text(s,x-width(s,size,bold),yy,size,bold);
  const rule=(yy:number,x=40,end=572)=>{content+=`${lineColor} RG 0.5 w ${x} ${yy} m ${end} ${yy} l S\n`;};
  function wrap(value:string,max:number,size=10,bold=false):string[]{
    return invoiceDatesInText(value).split(/\r?\n/).flatMap(rawLine=>{
      const line=clean(rawLine);
      const rows:string[]=[];let current='';
      for(const word of line.split(/\s+/).filter(Boolean)){
        if(current&&width(current+' '+word,size,bold)>max){rows.push(current);current='';}
        if(width(word,size,bold)>max){let part='';for(const c of word){if(width(part+c,size,bold)>max){rows.push(part);part='';}part+=c;}current=part;}
        else current+=(current?' ':'')+word;
      }
      if(current)rows.push(current);return rows.length?rows:[''];
    });
  }
  function band(top:number,height:number){const x=40,w=532,r=4,b=top-height,k=r*.5522848;content+=`0.94 0.96 0.94 rg ${x+r} ${b} m ${x+w-r} ${b} l ${x+w-r+k} ${b} ${x+w} ${b+r-k} ${x+w} ${b+r} c ${x+w} ${top-r} l ${x+w} ${top-r+k} ${x+w-r+k} ${top} ${x+w-r} ${top} c ${x+r} ${top} l ${x+r-k} ${top} ${x} ${top-r+k} ${x} ${top-r} c ${x} ${b+r} l ${x} ${b+r-k} ${x+r-k} ${b} ${x+r} ${b} c f\n`;}
  function tableHeader(){text('#',40,y,9,true);text('Product or service',62,y,9,true);text('Description',210,y,9,true);right('Qty',433,y,9,true);right('Rate',493,y,9,true);right('Amount',572,y,9,true);rule(y-10);y-=30;}
  function newPage(first=false,table=false){
    if(content)pages.push(content);content='';
    text('INVOICE',40,770,13,true,green);
    text('Kim & Sons Food Company LLC',40,747,16,true);text('41 Sylvan Ave',40,727,9);text('Englewood Cliffs, NJ 07632',40,713,9);
    text('cliffs@cliffslunchclub.com',40,696,9);text('(201) 947-5515',40,682,9);
    if(first){
      const schoolRows=wrap(invoice.school_name,496,11,true),top=665,height=158+(schoolRows.length-1)*14;band(top,height);
      text('Bill to',56,top-23,9,true,muted);let yy=top-41;for(const row of schoolRows){text(row,56,yy,11,true);yy-=14;}rule(yy-4,56,556);yy-=26;
      const info=[['Invoice no.',invoice.number],['Invoice date',invoiceDate(invoice.invoice_date)],[invoice.period_start?'Service period':'Service month',invoice.period_start?invoiceDate(invoice.period_start)+' to '+invoiceDate(invoice.period_end||''):invoiceMonth(invoice.month)],...(showInvoiceTerms(invoice) ? [['Due date',invoice.due_date?invoiceDate(invoice.due_date):'Due upon receipt'],['Terms',invoice.due_date?'Due by end of service period':'Due upon receipt']] : [])];
      for(const [label,value]of info){text(label+':',56,yy,9);const rows=wrap(value,390,9);for(const row of rows){text(row,158,yy,9);yy-=14;}}
      y=top-height-30;
    }else{rule(671);text('Invoice '+invoice.number+' - continued',40,653,10,true);y=626;}
    if(table)tableHeader();
  }
  newPage(true,true);
  invoice.lines.forEach((item,index)=>{
    const product=item.baseline?'School Lunch Catering':item.request_id?'One-off Lunch':item.adjustment_type==='carry'?'Schedule Adjustment':['schedule','pending'].includes(item.adjustment_type||'')?'Schedule Adjustment':'Additional Item';
    let rows=wrap(item.description+(item.taxable?'':' (non-taxable)'),185,9),firstPart=true;
    while(rows.length){
      if(y<96)newPage(false,true);
      const count=Math.max(1,Math.floor((y-65)/12)),chunk=rows.slice(0,count);rows=rows.slice(count);
      text(String(index+1)+(firstPart?'':'.'),40,y,9);for(const [i,row]of wrap(product+(firstPart?'':' (cont.)'),136,9,true).entries())text(row,62,y-i*12,9,true);
      if(firstPart){right(new Intl.NumberFormat('en-US').format(item.quantity),433,y,9);right(money(Math.round(item.rate*100)),493,y,9);right(money(item.amount_cents??Math.round(item.quantity*Math.round(item.rate*100))),572,y,9);}
      chunk.forEach((row,i)=>text(row,210,y-i*12,9));y-=Math.max(chunk.length,2)*12+12;rule(y+4);y-=10;firstPart=false;
      if(rows.length)newPage(false,true);
    }
  });
  if(y<205)newPage();
  const summaryTop=y-10;let yy=summaryTop;
  rule(yy+15,370,572);text('Subtotal',370,yy,10);right(money(invoice.subtotal_cents),572,yy);yy-=24;
  text('Sales tax (6.625%)',370,yy,10);right(money(invoice.tax_cents),572,yy);yy-=15;rule(yy,370,572);yy-=25;
  text('Total / Balance Due',370,yy,10,true);right(money(invoice.total_cents),572,yy,12,true);rule(yy-15,370,572);
  const totalsBottom=yy-15;
  text('Service breakdown',40,summaryTop,10,true);let breakdownY=summaryTop-19;
  const breakdown=wrap(invoiceBreakdownText(invoice.generated_notes||'See invoice line items for service details.'),300,9);
  let remaining:string[]=[];
  for(let i=0;i<breakdown.length;i++){if(breakdownY<70){remaining=breakdown.slice(i);break;}text(breakdown[i],40,breakdownY,9);breakdownY-=13;}
  y=Math.min(breakdownY,totalsBottom)-26;
  if(remaining.length){newPage();text('Service breakdown (continued)',40,y,10,true);y-=20;for(const row of remaining){if(y<65){newPage();text('Service breakdown (continued)',40,y,10,true);y-=20;}text(row,40,y,9);y-=13;}y-=20;}
  if(invoice.notes){if(y<105)newPage();text('Notes',40,y,10,true);y-=20;for(const row of wrap(invoice.notes,532,9)){if(y<65){newPage();text('Notes (continued)',40,y,10,true);y-=20;}text(row,40,y,9);y-=13;}}
  pages.push(content);
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${fontWidths[0].join(' ')}] >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${fontWidths[1].join(' ')}] >>`];
  const kids:number[]=[];pages.forEach((stream,index)=>{const pageId=objects.length+1; kids.push(pageId);stream+=`0.39 0.43 0.41 rg BT /F1 8 Tf 1 0 0 1 40 30 Tm (Cliffs Lunch Club) Tj ET BT /F1 8 Tf 1 0 0 1 512 30 Tm (Page ${index+1} of ${pages.length}) Tj ET\n`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);});objects[1]=`<< /Type /Pages /Kids [${kids.map(id=>id+' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});const start=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return new Blob([pdf],{type:'application/pdf'});
}
