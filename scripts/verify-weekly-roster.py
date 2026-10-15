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
 from datetime import datetime,timedelta
 from zoneinfo import ZoneInfo
 today=datetime.now(ZoneInfo('America/New_York')).date();monday=today-timedelta(days=today.weekday())
 mon=monday.isoformat();past=(monday-timedelta(days=7)).isoformat();upcoming=(monday+timedelta(days=7)).isoformat();wed=(monday+timedelta(days=2)).isoformat();thu=(monday+timedelta(days=3)).isoformat();fri=(monday+timedelta(days=4)).isoformat()
 patch('daycares',a['id'],{'billing_effective_date':past});patch('daycares',b['id'],{'billing_effective_date':past})
 room=create('classrooms',{'name':'Mobile Infants','daycare':a['id'],'active':True,'meal_size':'standard','age_order':1})
 purple=create('classrooms',{'name':'Purple Cats','daycare':a['id'],'active':True,'meal_size':'standard','age_order':2})
 baseline={'daycare':a['id'],'classroom':room['id'],'active':True,'service_days':['Monday','Wednesday'],'size':'standard','billing_effective_date':past}
 kid=create('students',{'name':'QA Amenze',**baseline})
 patch('students',kid['id'],{'service_days':['Monday','Tuesday','Wednesday'],'classroom':purple['id'],'billing_effective_date':upcoming})
 create('substitutions',{'daycare':a['id'],'student':kid['id'],'service_date':past,'weekday':'Monday','recurring':True,'code':'V'})
 create('menu_days',{'daycare':a['id'],'public_slug':a['public_slug'],'service_date':wed,'closed':True})
 trial=create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student_label':'QA Joe','classroom_label':'Purple Cats','service_date':thu,'status':'approved','code':'A','archived':True,'note':'Never print this private note'})
 create('lunch_requests',{'daycare':a['id'],'kind':'lunch','student_label':'QA Pending','classroom_label':'Purple Cats','service_date':fri,'status':'pending','note':'QA'})
 req('POST','/api/weekly-roster',{'daycare':a['id']},expected=403)
 req('POST','/api/weekly-roster',{'daycare':a['id']},other,403)
 req('POST','/api/weekly-roster',{'daycare':b['id']},staff,403)
 req('POST','/api/weekly-roster',{'daycare':a['id']},staff)
 out=req('POST','/api/weekly-roster',{'daycare':a['id']},clc)
 assert out['start']==mon and out['end']==fri
 monday_row=out['days'][0];assert monday_row['total']==1 and monday_row['classrooms'][0]['name']=='Mobile Infants' and monday_row['classrooms'][0]['students'][0]['sub']
 assert out['days'][1]['total']==0 and out['days'][2]['closed']
 assert out['days'][3]['total']==1 and out['days'][3]['classrooms'][0]['students'][0]['name']=='QA Joe' and out['days'][4]['total']==0
 assert 'Never print' not in json.dumps(out) and 'QA Pending' not in json.dumps(out)
 counts=req('POST','/api/billing',{'daycare':a['id'],'action':'counts','start':out['start'],'end':out['end']},clc)
 assert [d['kitchen_total'] for d in counts['dates']]==[d['total'] for d in out['days']]
 assert get('lunch_requests',trial['id'])['status']=='approved'
 patch('students',kid['id'],{'last_lunch_date':(monday-timedelta(days=1)).isoformat()})
 assert req('POST','/api/weekly-roster',{'daycare':a['id']},staff)['days'][0]['total']==0
 patch('daycares',b['id'],{'count_mode':'manual','baseline_counts':{'Monday':120},'clc_managed_counts':{'Monday':2},'billing_effective_date':past})
 manual=req('POST','/api/weekly-roster',{'daycare':b['id']},other);assert manual['days'][0]['total']==122 and all(not c['students'] for c in manual['days'][0]['classrooms'])
 print('PASS real PocketBase weekly roster: both admin roles, school isolation, current-week dates, future attendance and classroom changes, closures, substitutions, approved archived one-offs, no private notes, inclusive departures, manual counts and kitchen-total reconciliation',flush=True)
except Exception:
 log.flush();print((tmp/'server.log').read_text()[-5000:]);raise
finally:
 if server:server.terminate();server.wait(timeout=10)
 log.close();shutil.rmtree(tmp)
