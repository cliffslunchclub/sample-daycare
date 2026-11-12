import {useEffect,useState} from 'react';
import {pb} from './api';
import {CollapsiblePanel} from './CollapsiblePanel';
import {printMenuHtml} from './menuExport';
import {weeklyRosterBody,weeklyRosterHtml,weeklyRosterMatrixCss,type WeeklyRosterData} from './weeklyRoster';
export function WeeklyRoster({school,revision,students,substitutions,classrooms}:{school:{id:string};revision:number;students:unknown[];substitutions:unknown[];classrooms:unknown[]}){
 const [data,setData]=useState<WeeklyRosterData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');setData(null);void pb.send<WeeklyRosterData>('/api/weekly-roster',{method:'POST',body:{daycare:school.id},requestKey:null}).then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err?.response?.message||'Could not load the current-week lunch roster.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[school.id,revision,students,substitutions,classrooms,refresh]);
 return <CollapsiblePanel className="panel panel-stack current-week-roster" title="Current Week Lunch Roster" defaultExpanded={true}><div className="button-row"><button className="outline" disabled={loading||!data} onClick={()=>{if(data)printMenuHtml(weeklyRosterHtml(data));}}>Print / Save PDF</button><button className="quiet" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh Roster</button></div>{data&&/bergenfield/i.test(data.school_name)&&<style>{weeklyRosterMatrixCss}</style>}{loading&&<p role="status">Loading this week’s lunches…</p>}{error&&<p role="alert" className="notice error">{error}</p>}{data&&<div className="table-scroll"><div className={`weekly-roster-preview${/bergenfield/i.test(data.school_name)?' matrix-preview':''}`} dangerouslySetInnerHTML={{__html:weeklyRosterBody(data)}}/></div>}</CollapsiblePanel>;
}
