import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={module:{exports:{}}};vm.runInNewContext(readFileSync(new URL('../pb_hooks/audit-lib.js',import.meta.url),'utf8'),context);const audit=context.module.exports;
const row=(type,values)=>({collection:()=>({name:type}),publicExport:()=>({...values}),getString:key=>typeof values[key]==='object'?JSON.stringify(values[key]):String(values[key]??'')});
test('audit accounts exclude passwords, hashes, tokens and unapproved authentication fields',()=>{
 const value=audit.snapshot(row('users',{id:'x',email:'school@example.com',display_name:'School Admin',active:true,password:'secret',passwordHash:'hash',tokenKey:'token',verified:true,role:'daycare_admin',daycare:'bf'}));
 assert.deepEqual(Object.keys(value).sort(),['active','daycare','display_name','email','role']);
 assert.equal(JSON.stringify(value).includes('secret'),false);
});
test('audit diffs retain before/after schedule arrays and omit unchanged fields',()=>{
 const diff=audit.changes({service_days:['Monday','Wednesday','Friday'],name:'Nolan',billing_effective_date:'2026-10-07'},{service_days:['Monday','Friday'],name:'Nolan',billing_effective_date:'2026-10-08'});
 assert.equal(Object.keys(diff).length,2);assert.equal(JSON.stringify(diff.service_days.before),'["Monday","Wednesday","Friday"]');assert.equal(JSON.stringify(diff.service_days.after),'["Monday","Friday"]');
});
test('audit collection denies client writes and enforces active role and school on both read rules',()=>{
 let saved;vm.runInNewContext(readFileSync(new URL('../pb_migrations/1791405900_audit_log.js',import.meta.url),'utf8'),{Collection:function(config){return config;},migrate:up=>up({save:r=>saved=r})});
 assert.equal(saved.createRule,null);assert.equal(saved.updateRule,null);assert.equal(saved.deleteRule,null);
 assert.equal(saved.listRule,saved.viewRule);assert.match(saved.listRule,/@request.auth.active = true/);assert.match(saved.listRule,/daycare != "" && daycare = @request.auth.daycare/);assert.match(saved.listRule,/role = "clc_admin"/);
});
