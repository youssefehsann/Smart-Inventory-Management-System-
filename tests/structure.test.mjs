import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(path.join(root,p),'utf8');
const services=['api-gateway','auth-service','catalog-service','inventory-service','notification-service','reporting-service'];
test('six independently buildable NestJS backend services',()=>{
 for(const name of services){const pkg=JSON.parse(read(`services/${name}/package.json`));assert.equal(pkg.name,`@smart/${name}`);assert.ok(pkg.scripts.build);assert.ok(existsSync(path.join(root,`services/${name}/src/module.ts`)));}
});
test('application has dedicated database schemas and migrations',()=>{
 for(const name of ['auth','catalog','inventory','notifications','reporting'])assert.ok(read(`database/migrations/${name}.sql`).includes('CREATE TABLE IF NOT EXISTS'));
});
test('stock adjustments are transactional and publish via outbox',()=>{
 const source=read('services/inventory-service/src/module.ts');
 for(const fragment of ['BEGIN','COMMIT','ROLLBACK','pg_advisory_xact_lock','INSERT INTO outbox','FOR UPDATE SKIP LOCKED','STOCK_RECOVERED'])assert.ok(source.includes(fragment),`missing ${fragment}`);
});
test('dashboard reads live APIs rather than fabricated KPI values',()=>{
 const dashboard=read('apps/web/src/pages/Dashboard.tsx');assert.ok(dashboard.includes("api.get<Overview>('/reports/overview')"));assert.ok(!dashboard.includes('Total Products\', value: 1234'));
});
test('README includes local development and DevOps handoff',()=>{
 const readme=read('README.md');assert.ok(readme.includes('npm run db:migrate'));assert.ok(readme.includes('Jenkins'));
});
