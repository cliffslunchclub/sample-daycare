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

 patch('daycares',a['id'],{'allow_substitutions':True})
 room=create('classrooms',{'name':'QA Room','daycare':a['id'],'active':True,'meal_size':'standard'})
 kid=create('students',{'name':'QA Student','daycare':a['id'],'classroom':room['id'],'active':True,'service_days':['Tuesday'],'size':'standard'})
 sub=create('substitutions',{'daycare':a['id'],'student':kid['id'],'service_date':'2026-10-13','weekday':'Tuesday','recurring':True,'code':'A'})
 def label(code='A',field='name',value='Tuesday',token=clc,expected=200):
  return req('POST','/api/substitution-legend',{'daycare':a['id'],'code':code,'field':field,'value':value},token,expected)
 label(token='',expected=403);label(token=staff,expected=403);label(token=other,expected=403)
 label(value='',expected=400);label(value='x'*41,expected=400);label(code='Z',expected=400)
 label();label(code='B',value='Tuesday',expected=400);label(code='C',value='Wednesday')
 label(field='description',value='Chicken & Rice')
 school_a=get('daycares',a['id']);assert school_a['sub_option_names']=={'A':'Tuesday','C':'Wednesday'}
 assert school_a['sub_a_label']=='Chicken & Rice'
 assert not get('daycares',b['id']).get('sub_option_names')
 assert get('substitutions',sub['id'])['code']=='A'
 public=next(s for s in req('GET','/api/public-schools') if s['public_slug']==a['public_slug'])
 assert public['sub_option_names']['A']=='Tuesday' and public['substitution_options']['A']=='Chicken & Rice'
 # Existing installations add the field on first save before a restart activates migrations.
 collection=req('GET','/api/collections/daycares',token=supertoken)
 req('PATCH','/api/collections/'+collection['id'],{'fields':[f for f in collection['fields'] if f['name']!='sub_option_names']},supertoken)
 assert req('GET','/api/public-schools')
 label();assert get('daycares',a['id'])['sub_option_names']=={'A':'Tuesday'}
 logs=req('GET','/api/collections/audit_logs/records?perPage=100',token=clc)['items']
 assert any('sub_option_names' in x.get('changes',{}) for x in logs)
 print('PASS substitution labels: superadmin-only, validation, school isolation, unchanged assignments, public labels, audit history, hot schema creation')
except Exception:
 log.flush();print((tmp/'server.log').read_text()[-5000:]);raise
finally:
 if server:server.terminate();server.wait(timeout=10)
 log.close();shutil.rmtree(tmp)
