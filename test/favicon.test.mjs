import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('all four preschool frontends share the CLC favicon entrypoint',()=>{
 const html=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');
 const svg=fs.readFileSync(new URL('../frontend/src/assets/clc-favicon.svg',import.meta.url),'utf8');
 const workflow=fs.readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\/src\/assets\/clc-favicon\.svg"\s*\/>/);
 assert.match(svg,/<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+viewBox="0 0 64 64">/);
 assert.match(svg,/fill="#35443a"/);
 assert.match(svg,/fill="#dc7056"/);
 for(const domain of ['preschool','lba-bf','lba-fl','tle-ec']){
   assert.match(workflow,new RegExp("'"+domain+"'"),domain+' must receive shared frontend');
 }
 assert.match(workflow,/put -r frontend\/dist\/assets/,'Versioned icon asset gets deployed');
 assert.match(workflow,/put frontend\/dist\/index\.html/,'Updated icon reference gets deployed');
});
