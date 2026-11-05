import { Module, Controller, All, Req, Res, HttpException, Get, Injectable, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { getIdentity, redis } from '@smart/common';
const routing:[RegExp,string][]=[
  [/^auth\//, 'AUTH_URL'],[/^products(?:\/|$)/,'CATALOG_URL'],[/^categories(?:\/|$)/,'CATALOG_URL'],[/^suppliers(?:\/|$)/,'CATALOG_URL'],
  [/^warehouses(?:\/|$)/,'INVENTORY_URL'],[/^stock(?:\/|$)/,'INVENTORY_URL'],[/^low-stock(?:\/|$)/,'INVENTORY_URL'],
  [/^inventory(?:\/|$)/,'INVENTORY_URL'],[/^movements(?:\/|$)/,'INVENTORY_URL'],[/^alerts(?:\/|$)/,'NOTIFICATION_URL'],[/^reports(?:\/|$)/,'REPORTING_URL']
];
const fallbacks:Record<string,string>={AUTH_URL:'http://localhost:4001',CATALOG_URL:'http://localhost:4002',INVENTORY_URL:'http://localhost:4003',NOTIFICATION_URL:'http://localhost:4004',REPORTING_URL:'http://localhost:4005'};
const cache=redis();cache.on('error',()=>{});
@Controller()
class GatewayController {
  @Get('health') health(){return {status:'ok'};}
  @Get('ready') async ready(){await cache.ping();return {status:'ready'};}
  @All('api/*') async forward(@Req() req:Request,@Res() res:Response){
    const full=req.originalUrl.replace(/^\/api\//,'');const path=full.split('?')[0];
    const found=routing.find(([re])=>re.test(path));if(!found)throw new HttpException('Unknown API resource',404);
    const isPublic=req.method==='POST' && (path==='auth/login'||path==='auth/refresh');
    if(!isPublic)getIdentity(req.headers.authorization);
    const ip=String(req.ip||'unknown');
    const key=`rate:${isPublic?'login':'api'}:${ip}:${Math.floor(Date.now()/60000)}`;
    try{const current=await cache.incr(key);if(current===1)await cache.expire(key,75);if(current>(isPublic?15:240))throw new HttpException('Rate limit exceeded',429);}
    catch(e){if(e instanceof HttpException)throw e; /* Redis outage should not black-hole HTTP */ }
    const target=(process.env[found[1]] || fallbacks[found[1]])+'/'+full;
    try{
      const response=await fetch(target,{
        method:req.method,headers:{'Authorization':req.headers.authorization||'','Content-Type':req.headers['content-type']||'application/json'},
        body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body??{}),signal:AbortSignal.timeout(15000)
      });
      res.status(response.status);
      const contentType=response.headers.get('content-type');if(contentType)res.setHeader('Content-Type',contentType);
      const disposition=response.headers.get('content-disposition');if(disposition)res.setHeader('Content-Disposition',disposition);
      res.send(Buffer.from(await response.arrayBuffer()));
    }catch(e:any){if(e instanceof HttpException)throw e;res.status(502).json({message:'The requested service is currently unreachable',statusCode:502});}
  }
}
@Module({controllers:[GatewayController]}) export class AppModule {}
