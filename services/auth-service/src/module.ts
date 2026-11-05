import { Module, Controller, Get, Post, Patch, Param, Headers, Body, UseGuards, BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { JwtGuard, Roles, getIdentity, poolFor, parse, paging, uuid, HealthControllerFactory } from '@smart/common';
const db = poolFor('AUTH_DATABASE_URL');
const secret = () => process.env.JWT_SECRET || 'dev-only-unsafe-secret';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const loginShape = z.object({ email:z.string().email(), password:z.string().min(1) });
const userShape = z.object({ email:z.string().email(), fullName:z.string().min(2).max(100), password:z.string().min(10), role:z.enum(['admin','manager','staff']) });
const publicUser = (row:any) => ({ id:row.id, email:row.email, fullName:row.full_name, role:row.role, active:row.active, createdAt:row.created_at });
async function tokens(row:any) {
  const accessToken = jwt.sign({ sub:row.id,email:row.email,name:row.full_name,role:row.role,type:'access' }, secret(), { expiresIn:'15m' });
  const refreshToken = jwt.sign({ sub:row.id,type:'refresh',jti:randomUUID() }, secret(), {expiresIn:'7d'});
  await db.query('INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+ INTERVAL \'7 days\')', [randomUUID(),row.id,hash(refreshToken)]);
  return { accessToken,refreshToken,user:publicUser(row) };
}
@Controller('auth')
class AuthController {
  @Post('login') async login(@Body() body:any) {
    const data = parse(loginShape,body);
    const {rows} = await db.query('SELECT * FROM users WHERE email=$1 AND active=TRUE',[data.email.toLowerCase()]);
    if (!rows[0] || !await bcrypt.compare(data.password,rows[0].password_hash)) throw new UnauthorizedException('Incorrect email or password');
    return tokens(rows[0]);
  }
  @Post('refresh') async refresh(@Body() body:any) {
    const refreshToken=String(body?.refreshToken || ''); let decoded:any;
    try { decoded=jwt.verify(refreshToken,secret()); if(decoded.type!=='refresh') throw Error(); }
    catch { throw new UnauthorizedException('Invalid refresh token'); }
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const used=await client.query('SELECT id FROM refresh_tokens WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE',[hash(refreshToken),decoded.sub]);
      if(!used.rowCount) throw new UnauthorizedException('Refresh token was revoked');
      const rows=await client.query('SELECT * FROM users WHERE id=$1 AND active=TRUE',[decoded.sub]);
      if(!rows.rowCount) throw new UnauthorizedException('User inactive');
      await client.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1',[used.rows[0].id]);
      await client.query('COMMIT'); return tokens(rows.rows[0]);
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  @UseGuards(JwtGuard) @Post('logout') async logout(@Body() body:any) {
    if(body?.refreshToken) await db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1',[hash(body.refreshToken)]);
    return {ok:true};
  }
  @UseGuards(JwtGuard) @Get('me') async me(@Headers('authorization') auth:string) {
    const user=getIdentity(auth); const {rows}=await db.query('SELECT * FROM users WHERE id=$1',[user.sub]);
    if(!rows[0] || !rows[0].active) throw new UnauthorizedException();return publicUser(rows[0]);
  }
  @UseGuards(JwtGuard) @Patch('me') async updateMe(@Headers('authorization') auth:string,@Body() body:any){
    const user=getIdentity(auth);const data=parse(z.object({fullName:z.string().min(2).max(100)}),body);
    const {rows}=await db.query('UPDATE users SET full_name=$1 WHERE id=$2 RETURNING *',[data.fullName,user.sub]);return publicUser(rows[0]);
  }
  @UseGuards(JwtGuard) @Roles('admin') @Get('users') async users(){
    const rows=await db.query('SELECT id,email,full_name,role,active,created_at FROM users ORDER BY created_at DESC');return rows.rows.map(publicUser);
  }
  @UseGuards(JwtGuard) @Roles('admin') @Post('users') async addUser(@Body() body:any){
    const data=parse(userShape,body);
    try {const {rows}=await db.query('INSERT INTO users(id,email,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),data.email.toLowerCase(),data.fullName,await bcrypt.hash(data.password,12),data.role]);return publicUser(rows[0]);}
    catch(e:any){if(e.code==='23505')throw new ConflictException('Email already exists');throw e;}
  }
  @UseGuards(JwtGuard) @Roles('admin') @Patch('users/:id') async modify(@Param('id') userId:string,@Body() body:any,@Headers('authorization') auth:string){
    parse(uuid,userId);const data=parse(z.object({ fullName:z.string().min(2).optional(),role:z.enum(['admin','manager','staff']).optional(),active:z.boolean().optional() }).refine(v=>Object.keys(v).length>0),body);
    if(userId===getIdentity(auth).sub && (data.role && data.role!=='admin' || data.active===false)) throw new BadRequestException('Cannot remove your own admin access');
    const {rows}=await db.query('UPDATE users SET full_name=COALESCE($1,full_name),role=COALESCE($2,role),active=COALESCE($3,active) WHERE id=$4 RETURNING *',[data.fullName??null,data.role??null,data.active??null,userId]);
    if(!rows[0])throw new NotFoundException();return publicUser(rows[0]);
  }
}
@Module({controllers:[AuthController,HealthControllerFactory(()=>db.query('SELECT 1'))]}) export class AppModule {}
