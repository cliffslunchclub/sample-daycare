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
 # Simulate a hot deployment with the new schema migration not yet applied.
 schema=req('GET','/api/collections/students',token=supertoken)
 patchfields=[f for f in schema['fields'] if f['name']!='last_lunch_date']
 req('PATCH','/api/collections/students',{'fields':patchfields,'deleteRule':'@request.auth.active = true'},supertoken)
 req('GET','/api/student-lifecycle',expected=403)
 req('GET','/api/student-lifecycle',token=staff)
 schema=req('GET','/api/collections/students',token=supertoken)
 assert any(f['name']=='last_lunch_date' for f in schema['fields']) and 'clc_admin' in schema['deleteRule']
 req('GET','/api/student-lifecycle',token=clc)
 room=create('classrooms',{'name':'QA Classroom','daycare':a['id'],'active':True,'meal_size':'standard'})
 def lifecycle(body,token=staff,expected=200):return req('POST','/api/student-lifecycle',{'daycare':a['id'],**body},token,expected)
 def billing(body,token=clc,expected=200):return req('POST','/api/billing',{'daycare':a['id'],**body},token,expected)
 data={'name':'QA Graduate','classroom':room['id'],'service_days':['Friday'],'active':True,'billing_effective_date':'2026-10-01','last_lunch_date':''}
 lifecycle({'action':'save',**data})
 students=req('GET','/api/collections/students/records?filter='+urllib.parse.quote('daycare="'+a['id']+'"'),token=staff)['items'];kid=students[0]
 billing({'action':'request','kind':'lunch','student':kid['id'],'service_dates':['2026-11-02','2026-11-03'],'note':'QA later lunches'})
 pending=req('GET','/api/collections/lunch_requests/records?filter='+urllib.parse.quote('daycare="'+a['id']+'"'),token=clc)['items'];ids=[r['id'] for r in pending]
 billing({'action':'approve-all-requests','ids':ids},staff,400)
 billing({'action':'approve-all-requests','ids':ids},other,403)
 invoice=billing({'action':'generate','month':'2026-11'})
 assert invoice['subtotal_cents']==1600
 result=billing({'action':'approve-all-requests','ids':ids});assert result['approved']==2
 invoice=get('invoices',invoice['id']);assert invoice['subtotal_cents']==2400
 billing({'action':'approve-all-requests','ids':ids},expected=400)
 preview=lifecycle({'action':'preview','students':[kid['id']],'last_lunch_date':'2026-10-30'})
 assert len(preview['requests'])==2
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-30'},expected=400)
 assert get('students',kid['id'])['last_lunch_date']==''
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-30','delete_future_requests':False,'reviewed_requests':ids})
 counts=billing({'action':'counts','start':'2026-10-30','end':'2026-11-06'})['dates']
 assert counts[0]['quantity']==1 and counts[3]['quantity']==0 and counts[3]['extra']==1
 nov=billing({'action':'recalculate','id':invoice['id']});assert nov['subtotal_cents']==800
 octinv=billing({'action':'generate','month':'2026-10'});assert octinv['subtotal_cents']==2000
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-30','delete_future_requests':True,'reviewed_requests':ids})
 assert all(get('lunch_requests',i)['status']=='deleted' for i in ids)
 assert get('invoices',invoice['id'])['subtotal_cents']==0
 assert get('students',kid['id'])['active'] is True
 req('DELETE','/api/collections/students/records/'+kid['id'],token=staff,expected=404)
 req('POST','/api/delete-students',{'daycare':a['id'],'students':[kid['id']]},staff,403)
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-31'},other,400)
 lifecycle({'action':'save','id':kid['id'],**data,'last_lunch_date':'2026-02-30'},expected=400)
 lifecycle({'action':'save','id':kid['id'],**data,'last_lunch_date':''})
 assert billing({'action':'counts','start':'2026-11-06','end':'2026-11-06'})['dates'][0]['quantity']==1
 # A bad request in Approve All rolls back every approval and invoice adjustment.
 bad=create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student_label':'QA Weekend','service_date':'2026-11-07','status':'pending','note':'QA'})
 good=create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student_label':'QA Trial','service_date':'2026-11-05','status':'pending','note':'QA'})
 billing({'action':'approve-all-requests','ids':[good['id'],bad['id']]},expected=400)
 assert get('lunch_requests',good['id'])['status']=='pending'
 assert get('invoices',invoice['id'])['subtotal_cents']==0
 # Deleting a later request never rewrites an issued invoice.
 issued_request=create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student':kid['id'],'student_label':'QA Graduate','service_date':'2026-11-04','status':'approved','invoice_id':invoice['id'],'note':'QA'})
 patch('invoices',invoice['id'],{'status':'issued','subtotal_cents':400,'tax_cents':27,'total_cents':427,'lines':[{'description':'QA issued lunch','quantity':1,'rate':4,'taxable':True,'amount_cents':400,'request_id':issued_request['id']}]})
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-30','delete_future_requests':True,'reviewed_requests':[]},expected=400)
 assert get('lunch_requests',issued_request['id'])['status']=='approved'
 result=lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-30','delete_future_requests':True,'reviewed_requests':[issued_request['id']]})
 assert get('invoices',invoice['id'])['total_cents']==427
 assert get('lunch_requests',issued_request['id'])['status']=='deleted' and 'Issued invoices are unchanged' in result['message']
 # Archive history persists beyond a permanent deletion.
 lifecycle({'action':'archive','students':[kid['id']],'last_lunch_date':'2026-10-15'})
 history=req('GET','/api/collections/schedule_history/records?filter='+urllib.parse.quote('entity="'+kid['id']+'"'),token=staff)['items']
 assert history and all(h['snapshot']['last_lunch_date']=='2026-10-15' for h in history)
 req('POST','/api/delete-students',{'daycare':a['id'],'students':[kid['id']]},clc)
 assert billing({'action':'counts','start':'2026-10-16','end':'2026-10-16'})['dates'][0]['quantity']==0
 audits=req('GET','/api/collections/audit_logs/records?filter='+urllib.parse.quote('entity_id="'+kid['id']+'"'),token=staff)['items']
 assert any('last_lunch_date' in h['changes'] for h in audits)
 print('PASS real PocketBase: hot schema setup, both admin roles, scoped archiving, inclusive dates, preserved history, one-off Yes/No deletion, draft totals, atomic Approve All, repeat protection and permission checks',flush=True)
except Exception:
 log.flush();print((tmp/'server.log').read_text()[-5000:]);raise
finally:
 if server:server.terminate();server.wait(timeout=10)
 log.close();shutil.rmtree(tmp)
