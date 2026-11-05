import { Module, Controller, Get, Patch, Query, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { Worker } from 'bullmq';
import { z } from 'zod';
import { poolFor, redis, JwtGuard, Roles, parse, paging, uuid, id, HealthControllerFactory } from '@smart/common';
const db=poolFor('NOTIFICATION_DATABASE_URL');
const connection=redis();connection.on('error',()=>{});
const worker=new Worker('smart-inventory-events',async job=>{
  const p=job.data as {eventId:string,productId:string,warehouseId:string,quantity:number,reorderLevel:number};
  if(job.name==='STOCK_LOW'){
    // Only one currently-open alert per warehouse/product. This works with BullMQ retry delivery.
    const open=await db.query("SELECT id FROM alerts WHERE product_id=$1 AND warehouse_id=$2 AND status='open' LIMIT 1",[p.productId,p.warehouseId]);
    if(!open.rowCount)await db.query(`INSERT INTO alerts(id,product_id,warehouse_id,title,message,severity,source_event_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[
      id(),p.productId,p.warehouseId,'Low stock detected',`Only ${p.quantity} units left (reorder at ${p.reorderLevel}).`,p.quantity===0?'critical':'warning',p.eventId
    ]);
  }else if(job.name==='STOCK_RECOVERED'){
    await db.query("UPDATE alerts SET status='resolved',resolved_at=NOW() WHERE product_id=$1 AND warehouse_id=$2 AND status='open'",[p.productId,p.warehouseId]);
  }
},{connection,concurrency:1});
worker.on('failed',(job,err)=>console.error('[alerts] event failed',job?.id,err.message));
@Controller('alerts') @UseGuards(JwtGuard)
class AlertsController {
  @Get() async all(@Query() query:any){
    const {page,limit}=parse(paging,query);const status=z.enum(['open','resolved','all']).catch('all').parse(query.status);
    const where=status==='all'?'': 'WHERE status=$1';const args=status==='all'?[]:[status];
    const count=await db.query(`SELECT COUNT(*)::int AS count FROM alerts ${where}`,args);
    const rows=await db.query(`SELECT id,product_id AS "productId",warehouse_id AS "warehouseId",title,message,severity,status,is_read AS "isRead",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM alerts ${where} ORDER BY created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,(page-1)*limit]);
    return {data:rows.rows,total:count.rows[0].count,page,limit};
  }
  @Get('unread-count') async unread(){const {rows}=await db.query("SELECT COUNT(*)::int AS count FROM alerts WHERE is_read=FALSE AND status='open'");return rows[0];}
  @Patch(':id/read') async markRead(@Param('id') alertId:string){parse(uuid,alertId);const {rows}=await db.query('UPDATE alerts SET is_read=TRUE WHERE id=$1 RETURNING id',[alertId]);if(!rows[0])throw new NotFoundException();return {ok:true};}
  @Patch(':id/resolve') @Roles('admin','manager') async resolve(@Param('id') alertId:string){parse(uuid,alertId);const {rows}=await db.query("UPDATE alerts SET status='resolved',resolved_at=NOW() WHERE id=$1 RETURNING id",[alertId]);if(!rows[0])throw new NotFoundException();return {ok:true};}
}
@Module({controllers:[AlertsController,HealthControllerFactory(()=>db.query('SELECT 1'))]}) export class AppModule {}
