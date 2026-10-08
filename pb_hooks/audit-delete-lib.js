function remove(app,id){
 app.runInTransaction(tx=>{
  const audit=tx.findRecordById('audit_logs',id);
  let hasOutbox=false;try{tx.findCollectionByNameOrId('discord_audit_outbox');hasOutbox=true;}catch(_){/* Discord may not be configured yet. */}
  const jobs=hasOutbox?tx.findRecordsByFilter('discord_audit_outbox','audit_id = {:id}','',0,0,{id}):[];
  if(jobs.some(job=>job.getString('status')==='processing'&&Date.parse(job.getString('lease_until'))>Date.now()))throw new Error('This notification is being delivered. Try deleting the record again in a moment.');
  for(const job of jobs)tx.delete(job);
  tx.delete(audit);
 });
}
module.exports={remove};
