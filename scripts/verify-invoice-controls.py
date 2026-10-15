import subprocess,tempfile,pathlib,time,socket,json,urllib.request,urllib.error,shutil,secrets
root=pathlib.Path(__file__).resolve().parents[1];tmp=pathlib.Path(tempfile.mkdtemp(prefix='clc-lifecycle-'));log=open(tmp/'server.log','w');server=None
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
base=f'http://127.0.0.1:{port}';password='Qa-'+secrets.token_urlsafe(24)
def req(method,path,body=None,token='',expected=200):
 data=json.dumps(body).encode() if body is not None else None
 request=urllib.request.Request(base+path,data=data,method=method,headers={'Content-Type':'application/json',**({'Authorization':token} if token else {})})
 try:
  with urllib.request.urlopen(request,timeout=15) as response:status=response.status;raw=response.read()
 except urllib.error.HTTPError as err:status=err.code;raw=err.read()
 value=json.loads(raw) if raw else {}
 assert status==expected,(method,path,status,value)
 return value
try:
 shutil.copytree(root/'pb_migrations',tmp/'migrations')
 flags=['--dir='+str(tmp/'data'),'--hooksDir='+str(root/'pb_hooks'),'--migrationsDir='+str(tmp/'migrations')]
 subprocess.run([str(root/'.runtime/pocketbase'),'superuser','upsert','qa@example.test',password,*flags],check=True,stdout=log,stderr=log)
 server=subprocess.Popen([str(root/'.runtime/pocketbase'),'serve','--http=127.0.0.1:'+str(port),*flags],stdout=log,stderr=log)
 for _ in range(100):
  try:req('GET','/api/health');break
  except Exception:time.sleep(.1)
 else:raise AssertionError('Server failed to start')
 supertoken=req('POST','/api/collections/_superusers/auth-with-password',{'identity':'qa@example.test','password':password})['token']
 def create(table,data,token=supertoken):return req('POST','/api/collections/'+table+'/records',data,token)
 def patch(table,id,data,token=supertoken):return req('PATCH','/api/collections/'+table+'/records/'+id,data,token)
 def get(table,id,token=supertoken):return req('GET','/api/collections/'+table+'/records/'+id,token=token)
 def school(slug):return create('daycares',{'name':'QA '+slug,'public_slug':slug,'active':True,'operations_enabled':True,'count_mode':'roster','invoice_rate':4,'billing_effective_date':'2026-10-01'})
 a=school('qa-lifecycle-a');b=school('qa-lifecycle-b')
 def user(email,role,school):
  u=create('users',{'email':email,'password':password,'passwordConfirm':password,'display_name':'QA Admin','role':role,'active':True,'daycare':school['id'],'verified':True})
  return req('POST','/api/collections/users/auth-with-password',{'identity':email,'password':password})['token']
 clc=user('qa-clc@example.test','clc_admin',a);staff=user('qa-school@example.test','daycare_admin',a);other=user('qa-other@example.test','daycare_admin',b)
 def billing(body):return req('POST','/api/billing',{'daycare':a['id'],**body},clc)
 def undo(id,action='preview',token='',expected=200):return req('POST','/api/audit-log/undo',{'action':action,'id':id,'token':token},clc,expected)
 def assignment(r):
  logs=req('GET','/api/collections/audit_logs/records?perPage=100&filter='+urllib.parse.quote('entity_id="'+r['id']+'"'),token=clc)['items']
  return next(x for x in logs if [k for k in x['changes'] if not k.startswith('__')]==['invoice_id'] and x['changes']['invoice_id']['after'])
 def lunch(date,name):return create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student_label':name,'service_date':date,'size':'standard','status':'approved','note':'QA billing undo'})
 def apply_undo(event):
  preview=undo(event['id']);assert preview['changes']['status']['after']=='pending'
  return undo(event['id'],'apply',preview['token'])
 # Additive schema setup also works when PocketHost hot-reloads before migrations run.
 for table,names in [('lunch_requests',['archived','billing_deferred']),('daycares',['invoice_adjustment_dismissals']),('invoices',['removed_adjustments'])]:
  schema=req('GET','/api/collections/'+table,token=supertoken);req('PATCH','/api/collections/'+table,{'fields':[f for f in schema['fields'] if f['name'] not in names]},supertoken)
 billing({'action':'pending-adjustments'})
 for table,names in [('lunch_requests',['archived','billing_deferred']),('daycares',['invoice_adjustment_dismissals']),('invoices',['removed_adjustments'])]:
  fields=req('GET','/api/collections/'+table,token=supertoken)['fields'];assert all(any(f['name']==name for f in fields) for name in names)
 # An automatically assigned draft charge is removed and stays removed on recalculation.
 r=lunch('2026-10-30','QA Draft Lunch');invoice=billing({'action':'generate','month':'2026-10'})
 event=assignment(r);before=get('invoices',invoice['id']);assert before['subtotal_cents']==400
 req('POST','/api/audit-log/undo',{'action':'preview','id':event['id']},staff,403)
 req('POST','/api/audit-log/undo',{'action':'preview','id':event['id']},expected=403)
 preview=undo(event['id']);assert get('invoices',invoice['id'])['total_cents']==before['total_cents']
 apply_undo(event);assert get('lunch_requests',r['id'])['status']=='pending' and not get('lunch_requests',r['id'])['invoice_id']
 after=get('invoices',invoice['id']);assert after['subtotal_cents']==0 and all(l.get('request_id')!=r['id'] for l in after['lines'])
 assert billing({'action':'recalculate','id':invoice['id']})['subtotal_cents']==0
 undo(event['id'],expected=400)
 # Closed invoice retains its original amounts and the request creates a pending credit.
 r=lunch('2026-11-03','QA Closed Lunch');nov=billing({'action':'generate','month':'2026-11'});event=assignment(r)
 patch('invoices',nov['id'],{'shared':True});closed=billing({'action':'close-invoice','id':nov['id']})
 apply_undo(event);now=get('invoices',nov['id'])
 assert now['lines']==closed['lines'] and now['total_cents']==closed['total_cents'] and now['closed_snapshot']==closed['closed_snapshot']
 pending=billing({'action':'pending-adjustments'})['items'];credit=next(x for x in pending if x.get('request_id')==r['id']);assert credit['quantity']==-1 and credit['amount_cents']==-400
 dec=billing({'action':'generate','month':'2026-12'});applied=billing({'action':'apply-pending','id':dec['id'],'items':[credit]});assert applied['subtotal_cents']==-400
 assert not any(x.get('request_id')==r['id'] for x in billing({'action':'pending-adjustments'})['items'])
 # Undo assignment of a pending positive correction removes its draft reservation.
 extra=lunch('2026-11-04','QA Later Lunch');item=next(x for x in billing({'action':'pending-adjustments'})['items'] if x.get('request_id')==extra['id'])
 billing({'action':'apply-pending','id':dec['id'],'items':[item]});event=assignment(extra)
 assert get('invoices',dec['id'])['subtotal_cents']==0
 apply_undo(event);assert get('invoices',dec['id'])['subtotal_cents']==-400
 assert not any(x.get('request_id')==extra['id'] for x in billing({'action':'pending-adjustments'})['items'])
 # A correction already billed on another closed invoice produces a new pending credit.
 billed=lunch('2026-11-05','QA Billed Correction');item=next(x for x in billing({'action':'pending-adjustments'})['items'] if x.get('request_id')==billed['id'])
 billing({'action':'apply-pending','id':dec['id'],'items':[item]});event=assignment(billed)
 patch('invoices',dec['id'],{'shared':True});closed_dec=billing({'action':'close-invoice','id':dec['id']})
 apply_undo(event);assert get('invoices',dec['id'])['lines']==closed_dec['lines']
 credit=next(x for x in billing({'action':'pending-adjustments'})['items'] if x.get('request_id')==billed['id']);assert credit['quantity']==-1
 # A changed assignment cannot be undone using an old preview.
 stale=lunch('2027-01-05','QA Stale Preview');jan=billing({'action':'generate','month':'2027-01'});event=assignment(stale);preview=undo(event['id'])
 patch('invoices',jan['id'],{'notes':'Changed after preview'})
 # Token watches financial lines/status, so change a line to invalidate it.
 lines=get('invoices',jan['id'])['lines'];lines.append({'description':'Manual charge','quantity':1,'rate':1,'taxable':True});patch('invoices',jan['id'],{'lines':lines})
 undo(event['id'],'apply',preview['token'],expected=400);assert get('lunch_requests',stale['id'])['status']=='approved'
 # New controls: archive does not change counts or invoice amounts, and is CLC-only.
 trial=get('lunch_requests',stale['id']);bill_before=get('invoices',jan['id'])
 req('POST','/api/billing',{'daycare':a['id'],'action':'archive-request','id':trial['id'],'archived':True},staff,400)
 req('POST','/api/billing',{'daycare':b['id'],'action':'archive-request','id':trial['id'],'archived':True},clc,400)
 billing({'action':'archive-request','id':trial['id'],'archived':True});assert get('lunch_requests',trial['id'])['archived'] and get('lunch_requests',trial['id'])['status']=='approved'
 assert get('invoices',jan['id'])['total_cents']==bill_before['total_cents']
 billing({'action':'archive-request','id':trial['id'],'archived':False});assert not get('lunch_requests',trial['id'])['archived']
 # Draft one-offs move to Pending without cancelling service or auto-rebilling.
 line=next(l for l in bill_before['lines'] if l.get('request_id')==trial['id'])
 result=billing({'action':'remove-adjustments','id':jan['id'],'lines':[json.dumps(line,separators=(',',':'))]})
 assert get('lunch_requests',trial['id'])['status']=='approved' and get('lunch_requests',trial['id'])['billing_deferred']
 billing({'action':'recalculate','id':jan['id']});assert not any(l.get('request_id')==trial['id'] for l in get('invoices',jan['id'])['lines'])
 pending=billing({'action':'pending-adjustments'})['items'];item=next(i for i in pending if i.get('request_id')==trial['id'])
 billing({'action':'dismiss-pending','id':item['id'],'token':item['token']});assert not any(i.get('request_id')==trial['id'] for i in billing({'action':'pending-adjustments'})['items'])
 # A second removed lunch can be explicitly reapplied in the same period.
 r=lunch('2027-01-06','QA Deferred')
 # Approve via the supported flow to attach to the existing draft.
 patch('lunch_requests',r['id'],{'status':'pending'});billing({'action':'request-status','id':r['id'],'status':'approved'})
 line=next(l for l in get('invoices',jan['id'])['lines'] if l.get('request_id')==r['id']);billing({'action':'remove-adjustments','id':jan['id'],'lines':[json.dumps(line,separators=(',',':'))]})
 item=next(i for i in billing({'action':'pending-adjustments'})['items'] if i.get('request_id')==r['id']);billing({'action':'apply-pending','id':jan['id'],'items':[item]});assert get('lunch_requests',r['id'])['invoice_id']==jan['id']
 # Schedule adjustments can be removed, recalculated, restored, and deferred after closing.
 c=school('qa-controls');room=create('classrooms',{'name':'QA Room','daycare':c['id'],'active':True,'meal_size':'standard'})
 def cb(body):return req('POST','/api/billing',{'daycare':c['id'],**body},clc)
 kid=create('students',{'name':'QA Schedule','daycare':c['id'],'classroom':room['id'],'active':True,'service_days':['Friday'],'size':'standard','billing_effective_date':'2026-10-01'})
 patch('students',kid['id'],{'service_days':['Tuesday','Friday'],'billing_effective_date':'2026-10-19'})
 oct=cb({'action':'generate','month':'2026-10'});line=next(l for l in oct['lines'] if l.get('adjustment_type')=='schedule');assert line['quantity']==2 and line['schedule_entity']=='student:'+kid['id']
 def remove_schedule(invoice):
  l=next(l for l in invoice['lines'] if l.get('adjustment_type')=='schedule');return cb({'action':'remove-adjustments','id':invoice['id'],'lines':[json.dumps(l,separators=(',',':'))]})
 removed=remove_schedule(oct);assert removed['subtotal_cents']==oct['subtotal_cents']-800
 recalced=cb({'action':'recalculate','id':oct['id']});assert recalced['subtotal_cents']==removed['subtotal_cents']
 item=next(i for i in cb({'action':'pending-adjustments'})['items'] if i.get('source_kind')=='draft');restored=cb({'action':'apply-pending','id':oct['id'],'items':[item]});assert restored['subtotal_cents']==oct['subtotal_cents']
 remove_schedule(restored);patch('invoices',oct['id'],{'shared':True});closed=cb({'action':'close-invoice','id':oct['id']});item=next(i for i in cb({'action':'pending-adjustments'})['items'] if i['entity']=='student:'+kid['id']);assert item['quantity']==2
 cb({'action':'dismiss-pending','id':item['id'],'token':item['token']});assert not cb({'action':'pending-adjustments'})['items']
 assert get('invoices',oct['id'])['lines']==closed['lines']
 # Grouped removal is atomic, including stale members, and keeps all kitchen lunches approved.
 group=[]
 for date in ['2027-01-07','2027-01-08']:
  r=lunch(date,'QA Group');patch('lunch_requests',r['id'],{'status':'pending'});billing({'action':'request-status','id':r['id'],'status':'approved'});group.append(r)
 saved=get('invoices',jan['id']);tokens=[json.dumps(l,separators=(',',':')) for l in saved['lines'] if l.get('request_id') in [r['id'] for r in group]]
 req('POST','/api/billing',{'daycare':a['id'],'action':'remove-adjustments','id':jan['id'],'lines':[tokens[0],'stale']},clc,400)
 assert get('invoices',jan['id'])['lines']==saved['lines'] and get('lunch_requests',group[0]['id'])['invoice_id']==jan['id']
 billing({'action':'remove-adjustments','id':jan['id'],'lines':tokens})
 assert all(get('lunch_requests',r['id'])['status']=='approved' and get('lunch_requests',r['id'])['billing_deferred'] for r in group)
 req('POST','/api/billing',{'daycare':a['id'],'action':'remove-adjustments','id':jan['id'],'lines':tokens},staff,400)
 # Negative schedule credits can also be deferred and still reconcile on close.
 d=school('qa-negative');room=create('classrooms',{'name':'QA Room','daycare':d['id'],'active':True,'meal_size':'standard'})
 kid=create('students',{'name':'QA Negative','daycare':d['id'],'classroom':room['id'],'active':True,'service_days':['Tuesday','Friday'],'size':'standard','billing_effective_date':'2026-10-01'})
 patch('students',kid['id'],{'service_days':['Friday'],'billing_effective_date':'2026-10-19'})
 def db(body):return req('POST','/api/billing',{'daycare':d['id'],**body},clc)
 inv=db({'action':'generate','month':'2026-10'});line=next(l for l in inv['lines'] if l.get('adjustment_type')=='schedule');assert line['quantity']==-2
 inv=db({'action':'remove-adjustments','id':inv['id'],'lines':[json.dumps(line,separators=(',',':'))]});patch('invoices',inv['id'],{'shared':True});closed=db({'action':'close-invoice','id':inv['id']});assert db({'action':'pending-adjustments'})['items'][0]['quantity']==-2
 # Dismissing a removed draft adjustment remains dismissed after that draft closes.
 e=school('qa-dismissed-draft');room=create('classrooms',{'name':'QA Room','daycare':e['id'],'active':True,'meal_size':'standard'})
 kid=create('students',{'name':'QA Dismissed','daycare':e['id'],'classroom':room['id'],'active':True,'service_days':['Friday'],'size':'standard','billing_effective_date':'2026-10-01'})
 patch('students',kid['id'],{'service_days':['Tuesday','Friday'],'billing_effective_date':'2026-10-19'})
 def eb(body):return req('POST','/api/billing',{'daycare':e['id'],**body},clc)
 inv=eb({'action':'generate','month':'2026-10'});line=next(l for l in inv['lines'] if l.get('adjustment_type')=='schedule');eb({'action':'remove-adjustments','id':inv['id'],'lines':[json.dumps(line,separators=(',',':'))]})
 item=eb({'action':'pending-adjustments'})['items'][0];eb({'action':'dismiss-pending','id':item['id'],'token':item['token']});assert not eb({'action':'pending-adjustments'})['items']
 patch('invoices',inv['id'],{'shared':True});eb({'action':'close-invoice','id':inv['id']});assert not eb({'action':'pending-adjustments'})['items']
 # New changes to a previously dismissed difference are visible for a fresh review.
 patch('students',kid['id'],{'service_days':['Tuesday','Wednesday','Friday'],'billing_effective_date':'2026-10-19'});assert eb({'action':'pending-adjustments'})['items']
 print('PASS additional controls: atomic grouped removal, unchanged kitchen lunches, school-role denial, deferred negative adjustments and dismissal across invoice close',flush=True)
 print('PASS controls: superadmin scoped archive/restore, unchanged lunches and invoices, one-off removal/defer/dismiss/reapply, schedule removal/recalculate/restore/close, immutable closed totals and manual pending corrections',flush=True)
 print('PASS real PocketBase: billing assignment undo, draft line/totals removal, no rebilling on recalculate, frozen closed invoices, pending credits, correction draft cleanup, already-billed corrections, stale preview and permissions',flush=True)
except Exception:
 log.flush();print((tmp/'server.log').read_text()[-5000:]);raise
finally:
 if server:server.terminate();server.wait(timeout=10)
 log.close();shutil.rmtree(tmp)
