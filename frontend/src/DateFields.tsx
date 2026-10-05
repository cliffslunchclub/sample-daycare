import { invoiceDate } from './invoicePdf';
export function DateField({value,onChange,required=false,disabled=false,label='Date'}:{value:string;onChange:(value:string)=>void;required?:boolean;disabled?:boolean;label?:string}) {
 return <input type="text" inputMode="numeric" placeholder="MM-DD-YYYY" aria-label={label} required={required} disabled={disabled} pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-[0-9]{4}" title="Use MM-DD-YYYY" value={invoiceDate(value)} onChange={e=>{const raw=e.target.value;const match=/^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);onChange(match?match[3]+'-'+match[1]+'-'+match[2]:raw);}}/>;
}
export function MonthField({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const [year,month]=value.split('-');const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
 return <span className="month-field"><select aria-label="Month" value={month} onChange={e=>onChange(year+'-'+e.target.value)}>{names.map((name,i)=><option key={name} value={String(i+1).padStart(2,'0')}>{name}</option>)}</select><select aria-label="Year" value={year} onChange={e=>onChange(e.target.value+'-'+month)}>{Array.from({length:101},(_,i)=>2000+i).map(year=><option key={year} value={year}>{year}</option>)}</select></span>;
}
