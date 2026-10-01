import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const version='0.28.4',binary=path.join(root,'.runtime','pocketbase');
function run(cmd,args,cwd=root){const r=spawnSync(cmd,args,{cwd,stdio:'inherit'});if(r.error||r.status!==0)throw new Error(`${cmd} failed: ${r.error||r.status}`);}
async function freePort(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Port ${port} is in use. Stop the other school app or choose CLC_PB_PORT and CLC_WEB_PORT.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>process.exit(code),350);}
try{
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<12))throw new Error('Install Node.js 22.12 or newer.');
 const pbPort=Number(process.env.CLC_PB_PORT||8090),webPort=Number(process.env.CLC_WEB_PORT||5173);
 await freePort(pbPort);await freePort(webPort);
 if(!existsSync(binary)){
  const arch=process.arch==='arm64'?'arm64':process.arch==='x64'?'amd64':null;
  if(!arch||!['darwin','linux'].includes(process.platform))throw new Error('The launcher supports Mac and Linux.');
  mkdirSync('.runtime',{recursive:true});const asset=`pocketbase_${version}_${process.platform}_${arch}.zip`,base=`https://github.com/pocketbase/pocketbase/releases/download/v${version}`;
  console.log('Downloading PocketBase…');
  run('curl',['-fL','--retry','2','--max-time','120','-o','.runtime/pocketbase.zip',`${base}/${asset}`]);
  run('curl',['-fL','--retry','2','--max-time','120','-o','.runtime/checksums.txt',`${base}/checksums.txt`]);
  const expected=readFileSync('.runtime/checksums.txt','utf8').split('\n').find(l=>l.trim().endsWith(asset))?.trim().split(/\s+/)[0];
  if(!expected||createHash('sha256').update(readFileSync('.runtime/pocketbase.zip')).digest('hex')!==expected)throw new Error('PocketBase download checksum did not match.');
  run('unzip',['-o','.runtime/pocketbase.zip','pocketbase','-d','.runtime']);chmodSync(binary,0o755);
 }
 const demo=process.env.CLC_DEMO!=='0',dataDir=path.resolve(process.env.CLC_DATA_DIR||'pb_data');
 const credentials=path.join(root,'.runtime','demo-login.json');
 let email=process.env.CLC_ADMIN_EMAIL,password=process.env.CLC_ADMIN_PASSWORD;
 if(demo){
  if(!email)email='clc@example.test';
  if(!password&&existsSync(credentials)){const c=JSON.parse(readFileSync(credentials,'utf8'));email=c.email;password=c.password;}
  if(!password){password=randomBytes(15).toString('base64url');mkdirSync('.runtime',{recursive:true});writeFileSync(credentials,JSON.stringify({email,password}),{mode:0o600});}
 }else if(!existsSync(path.join(dataDir,'data.db'))&&(!email||!password||password.length<12))throw new Error('For an empty production workspace, set CLC_ADMIN_EMAIL and CLC_ADMIN_PASSWORD (12+ characters).');
 if(!existsSync('frontend/node_modules'))run('npm',['ci'],path.join(root,'frontend'));
 const env={...process.env,TZ:'America/New_York',CLC_DEMO:demo?'1':'0',CLC_ADMIN_EMAIL:email||'',CLC_ADMIN_PASSWORD:password||'',CLC_PB_URL:`http://127.0.0.1:${pbPort}`};
 const pb=spawn(binary,['serve',`--http=127.0.0.1:${pbPort}`,`--dir=${dataDir}`,`--hooksDir=${root}/pb_hooks`,`--migrationsDir=${root}/pb_migrations`],{cwd:root,env,stdio:'inherit'});children.push(pb);pb.on('error',e=>{console.error(e);stop(1);});pb.on('exit',()=>{if(!stopping)stop(1);});
 let healthy=false;for(let i=0;i<100&&!stopping;i++){try{healthy=(await fetch(`http://127.0.0.1:${pbPort}/api/health`)).ok;}catch{}if(healthy)break;await new Promise(r=>setTimeout(r,100));}
 if(!healthy)throw new Error('PocketBase did not start. Read the error above.');
 const web=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--port',String(webPort)],{cwd:path.join(root,'frontend'),env,stdio:'inherit'});children.push(web);web.on('error',e=>{console.error(e);stop(1);});web.on('exit',()=>{if(!stopping)stop(1);});
 if(demo)console.log(`\nDemo accounts: ${email}, staff@example.test, garden@example.test, river@example.test\nInitial demo password: ${password}\nIf you changed an account password, use your updated password.`);
 console.log(`\nOpen http://127.0.0.1:${webPort} — Ctrl+C stops both servers.\n`);
 process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
}catch(e){console.error(e.message);stop(1);}
