import subprocess,tempfile,pathlib,time,socket,json,urllib.request,urllib.error,shutil,secrets
root=pathlib.Path(__file__).resolve().parents[1];tmp=pathlib.Path(tempfile.mkdtemp(prefix='clc-lifecycle-'));log=open(tmp/'server.log','w');server=None
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
base=f'http://127.0.0.1:{port}';password=secrets.token_urlsafe(24)
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
 print('PASS real PocketBase: billing assignment undo, draft line/totals removal, no rebilling on recalculate, frozen closed invoices, pending credits, correction draft cleanup, already-billed corrections, stale preview and permissions',flush=True)
except Exception:
 log.flush();print((tmp/'server.log').read_text()[-5000:]);raise
finally:
 if server:server.terminate();server.wait(timeout=10)
 log.close();shutil.rmtree(tmp)
