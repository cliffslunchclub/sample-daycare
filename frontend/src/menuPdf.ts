const glyphWidths = [0.278, 0.333, 0.474, 0.556, 0.556, 0.889, 0.722, 0.238, 0.333, 0.333, 0.389, 0.584, 0.278, 0.333, 0.278, 0.278, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.333, 0.333, 0.584, 0.584, 0.584, 0.611, 0.975, 0.722, 0.722, 0.722, 0.722, 0.667, 0.611, 0.778, 0.722, 0.278, 0.556, 0.722, 0.611, 0.833, 0.722, 0.778, 0.667, 0.778, 0.722, 0.667, 0.611, 0.722, 0.667, 0.944, 0.667, 0.667, 0.611, 0.333, 0.278, 0.333, 0.584, 0.556, 0.333, 0.556, 0.611, 0.556, 0.611, 0.556, 0.333, 0.611, 0.611, 0.278, 0.278, 0.556, 0.278, 0.889, 0.611, 0.611, 0.611, 0.611, 0.389, 0.556, 0.333, 0.611, 0.556, 0.778, 0.556, 0.556, 0.5, 0.389, 0.28, 0.389, 0.584];
const textWidth = (value: string, size: number) => [...value].reduce((sum, char) => sum + (glyphWidths[char.charCodeAt(0)-32] || 0.556), 0) * size;
type Meal = { menu?: string; note?: string; closed?: boolean };
const literal = (value: string) => value.replace(/[^\x20-\x7e]/g, '-').replace(/[\\()]/g, '\\$&');
export function menuPdf(school: string, month: string, mealFor: (date: string) => Meal): Blob {
  const first = new Date(`${month}-01T00:00:00Z`), last = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));
  const monday = new Date(first); monday.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  let content = '';
  const centered = (value: string, x: number, y: number, width: number, size=10, color='0 0 0') => { content += `${color} rg BT /F1 ${size} Tf ${(x+(width-textWidth(value,size))/2).toFixed(2)} ${y.toFixed(2)} Td (${literal(value)}) Tj ET\n`; };
  const rect = (x:number,y:number,w:number,h:number,color:string) => { content += `${color} rg ${x} ${y} ${w} ${h} re f 0 0 0 RG .5 w ${x} ${y} ${w} ${h} re S\n`; };
  const label = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
  centered(school,28,565,736,20);centered(`${label} Lunch Menu`,28,540,736,16);
  const width=147.2,left=28;
  ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach((day,i)=>{rect(left+i*width,495,width,28,'0.043 0.325 0.58');centered(day,left+i*width,505,width,11,'1 1 1');});
  let y=495;
  for(let start=monday.getTime();start<=last.getTime();start+=7*86400000){
    const dates=Array.from({length:5},(_,i)=>new Date(start+i*86400000));
    if(!dates.some(date=>date.toISOString().startsWith(month)))continue;
    dates.forEach((date,i)=>{
      const inside=date.toISOString().startsWith(month),meal=inside?mealFor(date.toISOString().slice(0,10)):{};
      const off=!inside||meal.closed,x=left+i*width;
      rect(x,y-18,width,18,!inside?'0.933 0.933 0.933':off?'0.957 0.8 0.8':'0.851 0.918 0.827');
      centered(`${date.getUTCMonth()+1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(-2)}`,x,y-13,width,9);
      rect(x,y-78,width,60,!inside?'0.933 0.933 0.933':off?'0.957 0.8 0.8':'1 0.949 0.8');
      const value=inside?(meal.closed?'No lunch service':meal.menu||'Menu will be posted soon')+(meal.note?`\n${meal.note}`:''):'';
      const lines=value.split(/\r?\n/).flatMap(line=>{const result:string[]=[];let current='';for(const word of line.split(/\s+/)){if(current&&textWidth(current+' '+word,10)>width-12){result.push(current);current='';}current+=(current?' ':'')+word;}result.push(current);return result;});
      const size=lines.length>4?8:10;
      lines.forEach((line,index)=>centered(line,x,y-18-(60-lines.length*(size+2))/2-size-index*(size+2),width,size));
    });y-=78;
  }
  const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,`<< /Length ${content.length} >>\nstream\n${content}endstream`];
  let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const start=pdf.length;
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([pdf],{type:'application/pdf'});
}
