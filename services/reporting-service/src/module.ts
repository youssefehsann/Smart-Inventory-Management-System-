import { Module, Controller, Get, Query, Headers, Res, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { Response } from 'express';
import { poolFor, JwtGuard, Roles, parse, id, getIdentity, HealthControllerFactory } from '@smart/common';
import { z } from 'zod';
const db=poolFor('REPORTING_DATABASE_URL');
const api={
  catalog:()=>process.env.CATALOG_URL||'http://localhost:4002',
  inventory:()=>process.env.INVENTORY_URL||'http://localhost:4003',
  notification:()=>process.env.NOTIFICATION_URL||'http://localhost:4004'
};
async function getJSON(url:string, auth:string):Promise<any> {
  try {const response=await fetch(url,{headers:{Authorization:auth},signal:AbortSignal.timeout(6500)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();}
  catch {throw new ServiceUnavailableException('A required service is temporarily unavailable');}
}
async function allPages(url:string, auth:string):Promise<{data:any[];total:number}>{
  const data:any[]=[];let page=1,total=0;
  do {
    const separator=url.includes('?')?'&':'?';
    const result=await getJSON(`${url}${separator}page=${page}&limit=100`,auth);
    data.push(...result.data);total=result.total;page++;
  }while(data.length<total && page<=100);
  if (data.length < total) throw new ServiceUnavailableException('Report exceeds the supported pagination limit');
  return {data,total};
}
async function overview(auth:string){
  const [products,stock,warehouses,lowStock,movements,trend,alerts,openAlerts]=await Promise.all([
    allPages(api.catalog()+'/products',auth),getJSON(api.inventory()+'/inventory/summary',auth),
    getJSON(api.inventory()+'/warehouses',auth),getJSON(api.inventory()+'/low-stock',auth),
    getJSON(api.inventory()+'/movements?limit=8',auth),getJSON(api.inventory()+'/inventory/trend',auth),
    getJSON(api.notification()+'/alerts?limit=8',auth),getJSON(api.notification()+'/alerts?status=open&limit=1',auth)
  ]);
  const catalog=new Map<string,any>(products.data.map((p:any)=>[p.id,p]));
  const stockRows=await allPages(api.inventory()+'/stock',auth);
  const inventoryValue=stockRows.data.reduce((sum:number,row:any)=>sum+row.quantity*(catalog.get(row.productId)?.unitPrice||0),0);
  const low=lowStock.map((r:any)=>({...r,productName:catalog.get(r.productId)?.name||r.productId,sku:catalog.get(r.productId)?.sku||''}));
  return {
    stats:{totalProducts:products.total,totalUnits:stock.totalUnits,totalWarehouses:warehouses.length,lowStockCount:stock.lowStockCount,inventoryValue:Math.round(inventoryValue*100)/100,openAlerts:openAlerts.total},
    warehouses,lowStock:low,
    recentMovements:movements.data.map((m:any)=>({...m,productName:catalog.get(m.productId)?.name||m.productId})),
    trend,productsByCategory:Object.values(products.data.reduce((groups:any,p:any)=>{const key=p.categoryName||'Other';groups[key]??={name:key,value:0};groups[key].value++;return groups;},{})),
    recentAlerts:alerts.data
  };
}
function csv(rows:any[],fields:{key:string,label:string}[]):string {
  const esc=(value:any)=>{let s=String(value??'');if(/^[=+@-]/.test(s) && typeof value==='string')s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return [fields.map(f=>esc(f.label)).join(','),...rows.map(r=>fields.map(f=>esc(r[f.key])).join(','))].join('\r\n')+'\r\n';
}
@Controller('reports') @UseGuards(JwtGuard)
class ReportsController {
  @Get('overview') async dashboard(@Headers('authorization') auth:string){return overview(auth);}
  @Get('exports') @Roles('admin','manager') async history(){return (await db.query('SELECT id,actor_id AS "actorId",report_type AS "reportType",created_at AS "createdAt" FROM exports ORDER BY created_at DESC LIMIT 30')).rows;}
  @Get('export') @Roles('admin','manager') async export(@Query('type') type:string,@Headers('authorization') auth:string,@Res() res:Response) {
    const kind=parse(z.enum(['stock','movements','low-stock']),type||'stock');
    const [stock,movements,low,products]=await Promise.all([
      allPages(api.inventory()+'/stock',auth),allPages(api.inventory()+'/movements',auth),
      getJSON(api.inventory()+'/low-stock',auth),allPages(api.catalog()+'/products',auth)
    ]);
    const byId=new Map(products.data.map((p:any)=>[p.id,p]));
    const names=(list:any[])=>list.map(r=>({...r,productName:(byId.get(r.productId) as any)?.name||r.productId}));
    const text=kind==='movements'
      ?csv(names(movements.data),[{key:'createdAt',label:'Date'},{key:'productName',label:'Product'},{key:'warehouseName',label:'Warehouse'},{key:'delta',label:'Change'},{key:'afterQuantity',label:'Stock After'},{key:'reason',label:'Reason'}])
      :csv(names(kind==='low-stock'?low:stock.data),[{key:'productName',label:'Product'},{key:'warehouseName',label:'Warehouse'},{key:'quantity',label:'Quantity'},{key:'reorderLevel',label:'Reorder Level'}]);
    await db.query('INSERT INTO exports(id,actor_id,report_type) VALUES($1,$2,$3)',[id(),getIdentity(auth).sub,kind]);
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="inventory-${kind}-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(text);
  }
}
@Module({controllers:[ReportsController,HealthControllerFactory(()=>db.query('SELECT 1'))]}) export class AppModule {}
