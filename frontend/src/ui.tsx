import {useEffect,useRef,useState,type ReactNode} from 'react';
import {errorMessage} from './api';
export type Values=Record<string,string>;
export interface Field {name:string;label:string;value?:string|number;type?:string;options?:[string,string][];required?:boolean;wide?:boolean;min?:number;step?:string;help?:string}
export interface FormSpec {title:string;fields:Field[];help?:string;submit?:(v:Values)=>Promise<unknown>}
export function Editor({spec,close,saved}:{spec:FormSpec;close:()=>void;saved:()=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} onCancel={close} aria-labelledby="editor-title"><div className="dialog-head"><h2 id="editor-title">{spec.title}</h2><button onClick={close} aria-label="Close">×</button></div><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const v=Object.fromEntries(new FormData(e.currentTarget)) as Values;try{await spec.submit?.(v);await saved();close();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}><div className="form-grid">{spec.fields.map(f=><label key={f.name} className={f.wide?'full':''}>{f.label}{f.options?<select aria-label={f.label} name={f.name} defaultValue={f.value} required={f.required}>{f.options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:f.type==='textarea'?<textarea aria-label={f.label} name={f.name} defaultValue={f.value} required={f.required}/>:<input aria-label={f.label} name={f.name} type={f.type||'text'} defaultValue={f.value} required={f.required} min={f.min} step={f.step} autoComplete={f.type==='password'?'new-password':undefined}/>} {f.help&&<small className="help">{f.help}</small>}</label>)}</div>{spec.help&&<p className="help" style={{marginTop:16}}>{spec.help}</p>}{error&&<p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></dialog>;
}
export const Card=({children}:{children:ReactNode})=><div className="card">{children}</div>;
export const Badge=({children,kind=''}:{children:ReactNode;kind?:string})=><span className={'pill '+kind}>{children}</span>;
export function Table({headers,rows}:{headers:string[];rows:ReactNode[][]}){return rows.length?<div className="table-wrap"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>:<div className="empty">Nothing to show yet.</div>;}
export const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
export const shortDate=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric'});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const field=(name:string,label:string,value:string|number='',type='text',wide=false):Field=>({name,label,value,type,wide,required:true});
export const choice=(name:string,label:string,options:[string,string][],value:string):Field=>({name,label,options,value,required:!options.some(([v])=>v==='')});
