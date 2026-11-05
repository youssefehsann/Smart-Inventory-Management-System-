import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(file)=>readFileSync(path.join(root,file),'utf8');
const json=(file)=>JSON.parse(read(file));
const services=['api-gateway','auth-service','catalog-service','inventory-service','notification-service','reporting-service'];

test('all six services load the shared root .env on Windows and Unix',()=>{
  for(const name of services){
    const scripts=json(`services/${name}/package.json`).scripts;
    assert.match(scripts.dev,/^cross-env PORT=40\d\d DOTENV_CONFIG_PATH=\.\.\/\.\.\/\.env /);
    assert.match(scripts.start,/^cross-env PORT=40\d\d DOTENV_CONFIG_PATH=\.\.\/\.\.\/\.env /);
  }
});
test('local Docker Compose provisions only developer databases and Redis',()=>{
  const compose=read('infra/local-services.yml');
  assert.match(compose,/postgres:/);
  assert.match(compose,/redis:/);
  assert.doesNotMatch(compose,/jenkins:|kubernetes:|grafana:/);
});
test('stock threshold changes check product existence and stock listings reject malformed UUIDs',()=>{
  const inventory=read('services/inventory-service/src/module.ts');
  assert.match(inventory,/reorder\(@Body\(\) body:any,@Headers\('authorization'\) auth:string\)/);
  assert.match(inventory,/await productExists\(d\.productId,auth\)/);
  const catalog=read('services/catalog-service/src/module.ts');
  assert.match(catalog,/parse\(z\.array\(uuid\)/);
  assert.match(catalog,/parse\(uuid,query\.categoryId\)/);
});
test('all service route prefixes are forwarded through the gateway',()=>{
  const gateway=read('services/api-gateway/src/module.ts');
  for(const prefix of ['auth','products','categories','suppliers','warehouses','stock','inventory','movements','alerts','reports','low-stock']){
    assert.ok(gateway.includes(prefix),`gateway missing ${prefix}`);
  }
});
test('no scaffold generator scripts remain in the deliverable',()=>{
  for(const name of ['create_base.py','create_db.py','create_services1.py','create_frontend.py']){
    assert.equal(existsSync(path.join(root,'scripts',name)),false);
  }
});
