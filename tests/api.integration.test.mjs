import {existsSync} from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const BASE=process.env.GATEWAY_URL||'http://localhost:4000';
const enabled=process.env.RUN_INTEGRATION==='1';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let access='';
async function call(path,method='GET',body){
 const res=await fetch(`${BASE}/api${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${access}`},body:body===undefined?undefined:JSON.stringify(body)});
 const type=res.headers.get('content-type')||'';
 const data=type.includes('json')?await res.json():await res.text();
 return {res,data};
}
const expectStatus=(r,s)=>assert.equal(r.res.status,s,JSON.stringify(r.data));
async function until(fn,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await sleep(800);}throw Error('Timed out waiting for async event');}
test('real multi-service workflow: login → product → stock → alert → recovery → CSV', {skip:!enabled,timeout:75000}, async()=>{
 const health=await fetch(`${BASE}/health`);assert.equal(health.status,200);
 let r=await call('/auth/login','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});expectStatus(r,201);access=r.data.accessToken;
 r=await call('/auth/me');expectStatus(r,200);assert.equal(r.data.role,'admin');
 r=await call('/warehouses');expectStatus(r,200);assert.ok(r.data.length>=1);
 const warehouseId=r.data[0].id;
 const sku='INTEGRATION-'+randomUUID().slice(0,8).toUpperCase();
 r=await call('/products','POST',{sku,name:'Integration Test Cable',description:'End-to-end test product',unitPrice:15,imageUrl:'',categoryId:null,supplierId:null});expectStatus(r,201);
 const productId=r.data.id;
 r=await call('/stock/adjust','POST',{productId,warehouseId,delta:5,reason:'E2E initial balance'});expectStatus(r,201);assert.equal(r.data.quantity,5);
 r=await call('/stock/adjust','POST',{productId,warehouseId,delta:-99999,reason:'Must reject negative stock'});assert.equal(r.res.status,400);
 r=await call('/stock?limit=100');expectStatus(r,200);assert.equal(r.data.data.find(x=>x.productId===productId)?.quantity,5);
 const low=await until(async()=>{const r=await call('/alerts?status=open&limit=100');return r.data.data.find(x=>x.productId===productId&&x.warehouseId===warehouseId);});assert.equal(low.status,'open');
 r=await call('/stock/adjust','POST',{productId,warehouseId,delta:25,reason:'E2E restock'});expectStatus(r,201);assert.equal(r.data.quantity,30);
 await until(async()=>{const r=await call('/alerts?status=resolved&limit=100');return r.data.data.find(x=>x.id===low.id);});
 // Catalog mutation must invalidate Redis's versioned product-list cache.
 r=await call(`/products?search=${sku}`);expectStatus(r,200);assert.equal(r.data.total,1);
 r=await call(`/products/${productId}`,'PATCH',{name:'Integration Test Cable (Updated)'});expectStatus(r,200);
 r=await call(`/products?search=${sku}`);expectStatus(r,200);assert.equal(r.data.data[0].name,'Integration Test Cable (Updated)');
 r=await call('/products?ids=not-a-uuid');expectStatus(r,400);
 // An atomic transfer must debit one location and credit the other.
 const destination=(await call('/warehouses')).data.find(w=>w.id!==warehouseId)?.id;
 assert.ok(destination,'Seed at least two warehouses for transfer test');
 r=await call('/stock/transfer','POST',{productId,fromWarehouseId:warehouseId,toWarehouseId:destination,quantity:7,reason:'E2E transfer'});expectStatus(r,201);
 assert.equal(r.data.from.quantity,23);assert.equal(r.data.to.quantity,7);
 await until(async()=>{const r=await call('/alerts?status=open&limit=100');return r.data.data.find(x=>x.productId===productId&&x.warehouseId===destination);});
 r=await call('/stock/reorder-level','PATCH',{productId,warehouseId:destination,reorderLevel:5});expectStatus(r,200);
 await until(async()=>{const r=await call('/alerts?status=resolved&limit=100');return r.data.data.find(x=>x.productId===productId&&x.warehouseId===destination);});
 // Only admins can manage users and only admins/managers can transfer stock.
 const email=`staff-${randomUUID().slice(0,8)}@example.test`;
 r=await call('/auth/users','POST',{fullName:'Integration Staff',email,password:'IntegrationPass456!',role:'staff'});expectStatus(r,201);
 const adminAccess=access;
 r=await call('/auth/login','POST',{email,password:'IntegrationPass456!'});expectStatus(r,201);access=r.data.accessToken;
 r=await call('/auth/users');expectStatus(r,403);
 r=await call('/stock/transfer','POST',{productId,fromWarehouseId:warehouseId,toWarehouseId:destination,quantity:1,reason:'Denied staff transfer'});expectStatus(r,403);
 access=adminAccess;
 r=await call('/reports/overview');expectStatus(r,200);assert.ok(r.data.stats.totalProducts>=1);
 r=await call('/reports/export?type=stock');expectStatus(r,200);assert.ok(r.data.includes('Product'));
});
