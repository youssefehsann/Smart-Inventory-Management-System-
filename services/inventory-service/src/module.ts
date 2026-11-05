import { Module, Controller, Get, Post, Patch, Param, Query, Body, Headers, UseGuards, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { JwtGuard, Roles, getIdentity, poolFor, parse, paging, uuid, id, HealthControllerFactory, redis } from '@smart/common';
const db = poolFor('INVENTORY_DATABASE_URL');
const connection = redis(); connection.on('error', () => {});
const queue = new Queue('smart-inventory-events', { connection });

const warehouseShape = z.object({ name:z.string().min(2).max(120), code:z.string().min(2).max(30), location:z.string().max(255).default('') });
const adjustShape = z.object({ productId:uuid, warehouseId:uuid, delta:z.number().int().min(-1000000).max(1000000).refine(v=>v!==0), reason:z.string().min(3).max(200) });
const transferShape = z.object({ productId:uuid, fromWarehouseId:uuid, toWarehouseId:uuid, quantity:z.number().int().positive().max(1000000), reason:z.string().min(3).max(200) });

/** Uses an advisory lock to serialize creation of stock rows that don't yet exist. */
async function lockRow(client:PoolClient, productId:string, warehouseId:string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${warehouseId}/${productId}`]);
  const exists = await client.query('SELECT * FROM stock WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[productId,warehouseId]);
  if (!exists.rowCount) await client.query('INSERT INTO stock(product_id,warehouse_id) VALUES($1,$2)',[productId,warehouseId]);
  const row = await client.query('SELECT * FROM stock WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[productId,warehouseId]);
  return { row:row.rows[0], isNew:!exists.rowCount };
}
async function recordChange(client:PoolClient, row:any, previousQuantity:number, quantity:number, isNew:boolean) {
  const low=quantity<=row.reorder_level;
  const previouslyLow=previousQuantity<=row.reorder_level;
  if ((isNew && low) || (!isNew && low!==previouslyLow)) {
    const eventId=id();
    const payload={eventId,productId:row.product_id,warehouseId:row.warehouse_id,quantity,reorderLevel:row.reorder_level,occurredAt:new Date().toISOString()};
    await client.query('INSERT INTO outbox(id,name,payload) VALUES($1,$2,$3)',[eventId,low?'STOCK_LOW':'STOCK_RECOVERED',JSON.stringify(payload)]);
  }
}
async function change(client:PoolClient, p:{productId:string,warehouseId:string,delta:number,reason:string,actorId:string,referenceId?:string}) {
  const {row,isNew}=await lockRow(client,p.productId,p.warehouseId);
  const quantity=Number(row.quantity)+p.delta;
  if(quantity<0)throw new BadRequestException('Insufficient stock for this operation');
  await client.query('UPDATE stock SET quantity=$1, updated_at=NOW() WHERE product_id=$2 AND warehouse_id=$3',[quantity,p.productId,p.warehouseId]);
  await client.query('INSERT INTO movements(id,product_id,warehouse_id,delta,after_quantity,reason,reference_id,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),p.productId,p.warehouseId,p.delta,quantity,p.reason,p.referenceId??null,p.actorId]);
  await recordChange(client,row,Number(row.quantity),quantity,isNew);
  return {productId:p.productId,warehouseId:p.warehouseId,quantity,reorderLevel:row.reorder_level};
}
async function productExists(productId:string,token:string) {
  try {
    const result = await fetch(`${process.env.CATALOG_URL || 'http://localhost:4002'}/products/${productId}`,{headers:{Authorization:token}});
    if(result.status===404)throw new NotFoundException('Product not found');
    if(!result.ok)throw new ServiceUnavailableException('Product catalog unavailable');
    const product:any=await result.json();
    if(!product.active)throw new BadRequestException('Product is inactive');
  }catch(e:any){if(e instanceof NotFoundException || e instanceof BadRequestException || e instanceof ServiceUnavailableException)throw e;throw new ServiceUnavailableException('Cannot validate product');}
}

@Controller('warehouses') @UseGuards(JwtGuard)
class WarehouseController {
  @Get() async all() {
    const {rows}=await db.query(`SELECT w.id,w.name,w.code,w.location,w.created_at AS "createdAt",COUNT(s.product_id)::int AS "products",COALESCE(SUM(s.quantity),0)::int AS "units" FROM warehouses w LEFT JOIN stock s ON s.warehouse_id=w.id GROUP BY w.id ORDER BY w.name`);
    return rows;
  }
  @Post() @Roles('admin','manager') async create(@Body() body:any) {
    const data=parse(warehouseShape,body);
    try {const {rows}=await db.query('INSERT INTO warehouses(id,name,code,location) VALUES($1,$2,$3,$4) RETURNING *',[id(),data.name,data.code.toUpperCase(),data.location]);return rows[0];}
    catch(e:any){if(e.code==='23505')throw new BadRequestException('Warehouse name or code already exists');throw e;}
  }
}
@Controller() @UseGuards(JwtGuard)
class InventoryController {
  @Get('stock') async stock(@Query() query:any) {
    const {page,limit,search}=parse(paging,query);let where='WHERE 1=1';const params:any[]=[];
    if(query.warehouseId){parse(uuid,query.warehouseId);params.push(query.warehouseId);where+=` AND s.warehouse_id=$${params.length}`;}
    if(query.lowOnly==='true')where+=' AND s.quantity<=s.reorder_level';
    const {rows}=await db.query(`SELECT s.product_id AS "productId",s.warehouse_id AS "warehouseId",w.name AS "warehouseName",s.quantity,s.reorder_level AS "reorderLevel",s.updated_at AS "updatedAt" FROM stock s JOIN warehouses w ON s.warehouse_id=w.id ${where} ORDER BY s.updated_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,(page-1)*limit]);
    const count=await db.query(`SELECT COUNT(*)::int AS count FROM stock s ${where}`,params);
    return {data:rows,total:count.rows[0].count,page,limit};
  }
  @Get('low-stock') async low() {
    return (await db.query(`SELECT s.product_id AS "productId",s.warehouse_id AS "warehouseId",w.name AS "warehouseName",s.quantity,s.reorder_level AS "reorderLevel",s.updated_at AS "updatedAt" FROM stock s JOIN warehouses w ON w.id=s.warehouse_id WHERE s.quantity<=s.reorder_level ORDER BY s.quantity ASC`)).rows;
  }
  @Get('inventory/summary') async summary(){
    const {rows}=await db.query('SELECT COUNT(*)::int AS "stockRecords",COUNT(DISTINCT product_id)::int AS "productsTracked",COALESCE(SUM(quantity),0)::int AS "totalUnits",COUNT(*) FILTER (WHERE quantity<=reorder_level)::int AS "lowStockCount" FROM stock');
    const warehouses=(await db.query('SELECT COUNT(*)::int AS total FROM warehouses')).rows[0].total;
    return {...rows[0],warehouses};
  }
  @Get('movements') async movements(@Query() query:any) {
    const {page,limit}=parse(paging,query);const params:any[]=[];let where='WHERE 1=1';
    if(query.productId){parse(uuid,query.productId);params.push(query.productId);where+=` AND m.product_id=$${params.length}`;}
    if(query.warehouseId){parse(uuid,query.warehouseId);params.push(query.warehouseId);where+=` AND m.warehouse_id=$${params.length}`;}
    const {rows}=await db.query(`SELECT m.id,m.product_id AS "productId",m.warehouse_id AS "warehouseId",w.name AS "warehouseName",m.delta,m.after_quantity AS "afterQuantity",m.reason,m.actor_id AS "actorId",m.created_at AS "createdAt" FROM movements m JOIN warehouses w ON w.id=m.warehouse_id ${where} ORDER BY m.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,(page-1)*limit]);
    const total=(await db.query(`SELECT COUNT(*)::int AS count FROM movements m ${where}`,params)).rows[0].count;
    return {data:rows,total,page,limit};
  }
  @Get('inventory/trend') async trend(){
    const {rows}=await db.query(`SELECT TO_CHAR(date_trunc('day', created_at),'YYYY-MM-DD') AS day,COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0)::int AS inbound,COALESCE(ABS(SUM(CASE WHEN delta<0 THEN delta ELSE 0 END)),0)::int AS outbound FROM movements WHERE created_at>=NOW()- INTERVAL '14 days' GROUP BY 1 ORDER BY 1`);return rows;
  }
  @Post('stock/adjust') @Roles('admin','manager','staff') async adjust(@Body() body:any,@Headers('authorization') auth:string) {
    const data=parse(adjustShape,body);await productExists(data.productId,auth);
    const actorId=getIdentity(auth).sub;const client=await db.connect();
    try {await client.query('BEGIN'); const result=await change(client,{...data,actorId});await client.query('COMMIT');return result;}
    catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  @Post('stock/transfer') @Roles('admin','manager') async transfer(@Body() body:any,@Headers('authorization') auth:string){
    const data=parse(transferShape,body);
    if(data.fromWarehouseId===data.toWarehouseId)throw new BadRequestException('Choose two distinct warehouses');
    await productExists(data.productId,auth);const actorId=getIdentity(auth).sub, ref=id();
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      // Prevent deadlocks by serializing both stock keys in the same global order.
      const keys=[`${data.fromWarehouseId}/${data.productId}`,`${data.toWarehouseId}/${data.productId}`].sort();
      for(const key of keys)await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
      const from=await change(client,{productId:data.productId,warehouseId:data.fromWarehouseId,delta:-data.quantity,reason:`Transfer out: ${data.reason}`,actorId,referenceId:ref});
      const to=await change(client,{productId:data.productId,warehouseId:data.toWarehouseId,delta:data.quantity,reason:`Transfer in: ${data.reason}`,actorId,referenceId:ref});
      await client.query('COMMIT');return {referenceId:ref,from,to};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  @Patch('stock/reorder-level') @Roles('admin','manager') async reorder(@Body() body:any,@Headers('authorization') auth:string){
    const d=parse(z.object({productId:uuid,warehouseId:uuid,reorderLevel:z.number().int().nonnegative().max(2147483647)}),body);
    await productExists(d.productId,auth);
    const client=await db.connect();
    try{await client.query('BEGIN');const {row,isNew}=await lockRow(client,d.productId,d.warehouseId);
      const before=Number(row.quantity)<=row.reorder_level;const after=Number(row.quantity)<=d.reorderLevel;
      await client.query('UPDATE stock SET reorder_level=$1,updated_at=NOW() WHERE product_id=$2 AND warehouse_id=$3',[d.reorderLevel,d.productId,d.warehouseId]);
      if((isNew && after) || before!==after){const eventId=id();await client.query('INSERT INTO outbox(id,name,payload) VALUES($1,$2,$3)',[eventId,after?'STOCK_LOW':'STOCK_RECOVERED',JSON.stringify({eventId,productId:d.productId,warehouseId:d.warehouseId,quantity:row.quantity,reorderLevel:d.reorderLevel,occurredAt:new Date().toISOString()})]);}
      await client.query('COMMIT');return {ok:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
}
// Durable publish: transactionally persisted stock events are retried after Redis outages or restarts.
async function publishOutbox(){
  const client=await db.connect();
  try {await client.query('BEGIN');const {rows}=await client.query('SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 40 FOR UPDATE SKIP LOCKED');
    for(const row of rows){await queue.add(row.name,row.payload,{jobId:row.id,attempts:8,backoff:{type:'exponential',delay:1500},removeOnComplete:{age:86400,count:5000}});
      await client.query('UPDATE outbox SET published_at=NOW() WHERE id=$1',[row.id]);}
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');console.error('[inventory] outbox delivery will retry:',(e as Error).message);}finally{client.release();}
}
setInterval(()=>{void publishOutbox();},3500).unref();
@Module({controllers:[WarehouseController,InventoryController,HealthControllerFactory(()=>db.query('SELECT 1'))]}) export class AppModule {}
