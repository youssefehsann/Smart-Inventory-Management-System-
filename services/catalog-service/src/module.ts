import { Module, Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { JwtGuard, Roles, poolFor, redis, parse, paging, uuid, id, HealthControllerFactory } from '@smart/common';
const db=poolFor('CATALOG_DATABASE_URL');
const cache=redis(); cache.on('error',()=>{});
const productShape=z.object({sku:z.string().min(3).max(50),name:z.string().min(2).max(160),description:z.string().max(1000).default(''),categoryId:uuid.nullable().optional(),supplierId:uuid.nullable().optional(),unitPrice:z.coerce.number().nonnegative().max(10000000),imageUrl:z.string().url().or(z.literal('')).default(''),active:z.boolean().default(true)});
const patchShape=productShape.partial();
const productSelect=`SELECT p.id,p.sku,p.name,p.description,p.category_id AS "categoryId",c.name AS "categoryName",p.supplier_id AS "supplierId",s.name AS "supplierName",p.unit_price::float AS "unitPrice",p.image_url AS "imageUrl",p.active,p.created_at AS "createdAt",p.updated_at AS "updatedAt" FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id`;
const clear = async () => { try {await cache.incr('catalog:version');}catch{} };
@Controller('products') @UseGuards(JwtGuard)
class ProductsController {
  @Get() async all(@Query() query:any) {
    const {page,limit,search}=parse(paging,query);
    const ids=query.ids ? parse(z.array(uuid).min(1).max(100),String(query.ids).split(',')) : [];
    const filters:string[]=['p.active=TRUE'];const values:any[]=[];
    if(search){values.push(`%${search}%`);filters.push(`(p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length})`);}
    if(query.categoryId){values.push(parse(uuid,query.categoryId));filters.push(`p.category_id=$${values.length}`);}
    if(ids.length){values.push(ids);filters.push(`p.id = ANY($${values.length}::uuid[])`);}
    const where='WHERE '+filters.join(' AND ');
    let cacheKey='';
    try {cacheKey=`products:v${await cache.get('catalog:version')??0}:${JSON.stringify({page,limit,search,ids,categoryId:query.categoryId})}`; const cached=await cache.get(cacheKey);if(cached)return JSON.parse(cached);}catch{}
    const count=await db.query(`SELECT COUNT(*)::int AS count FROM products p ${where}`,values);
    const data=await db.query(`${productSelect} ${where} ORDER BY p.created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,(page-1)*limit]);
    const response={data:data.rows,total:count.rows[0].count,page,limit};
    try{if(cacheKey)await cache.set(cacheKey,JSON.stringify(response),'EX',30);}catch{}
    return response;
  }
  @Get(':id') async one(@Param('id') productId:string){parse(uuid,productId);const {rows}=await db.query(`${productSelect} WHERE p.id=$1`,[productId]);if(!rows[0])throw new NotFoundException();return rows[0];}
  @Post() @Roles('admin','manager') async create(@Body() body:any){const d=parse(productShape,body);
    try {const {rows}=await db.query('INSERT INTO products(id,sku,name,description,category_id,supplier_id,unit_price,image_url,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[id(),d.sku,d.name,d.description,d.categoryId||null,d.supplierId||null,d.unitPrice,d.imageUrl,d.active]);await clear();return this.one(rows[0].id);}
    catch(e:any){if(e.code==='23505')throw new ConflictException('SKU already exists');throw e;}
  }
  @Patch(':id') @Roles('admin','manager') async update(@Param('id') productId:string,@Body() body:any){parse(uuid,productId);const d=parse(patchShape,body);
    const fieldMap:any={sku:'sku',name:'name',description:'description',categoryId:'category_id',supplierId:'supplier_id',unitPrice:'unit_price',imageUrl:'image_url',active:'active'};
    const fields=Object.keys(d);if(!fields.length)return this.one(productId);
    const params=fields.map(k=>(d as any)[k]);const assigns=fields.map((k,i)=>`${fieldMap[k]}=$${i+1}`).join(', ');
    try {const result=await db.query(`UPDATE products SET ${assigns},updated_at=NOW() WHERE id=$${fields.length+1} RETURNING id`,[...params,productId]);if(!result.rowCount)throw new NotFoundException();await clear();return this.one(productId);}
    catch(e:any){if(e.code==='23505')throw new ConflictException('SKU already exists');throw e;}
  }
  @Delete(':id') @Roles('admin','manager') async remove(@Param('id') productId:string){parse(uuid,productId);const result=await db.query('UPDATE products SET active=FALSE,updated_at=NOW() WHERE id=$1',[productId]);if(!result.rowCount)throw new NotFoundException();await clear();return {ok:true};}
}
@Controller('categories') @UseGuards(JwtGuard)
class CategoriesController {
 @Get() async all(){return (await db.query('SELECT * FROM categories ORDER BY name')).rows;}
 @Post() @Roles('admin','manager') async create(@Body() body:any){const d=parse(z.object({name:z.string().min(2),description:z.string().max(500).default('')}),body);
  try {const {rows}=await db.query('INSERT INTO categories(id,name,description) VALUES($1,$2,$3) RETURNING *',[id(),d.name,d.description]);return rows[0];}catch(e:any){if(e.code==='23505')throw new ConflictException('Category already exists');throw e;}}
}
@Controller('suppliers') @UseGuards(JwtGuard)
class SuppliersController {
 @Get() async all(){return (await db.query('SELECT id,name,email,phone,contact_name AS "contactName",created_at AS "createdAt" FROM suppliers ORDER BY name')).rows;}
 @Post() @Roles('admin','manager') async create(@Body() body:any){const d=parse(z.object({name:z.string().min(2),email:z.string().email().or(z.literal('')).default(''),phone:z.string().max(40).default(''),contactName:z.string().max(100).default('')}),body);
  const {rows}=await db.query('INSERT INTO suppliers(id,name,email,phone,contact_name) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,phone,contact_name AS "contactName"',[id(),d.name,d.email,d.phone,d.contactName]);return rows[0];}
 @Patch(':id') @Roles('admin','manager') async update(@Param('id') supplierId:string,@Body() body:any){parse(uuid,supplierId);const d=parse(z.object({name:z.string().min(2).optional(),email:z.string().email().or(z.literal('')).optional(),phone:z.string().optional(),contactName:z.string().optional()}),body);
  const {rows}=await db.query('UPDATE suppliers SET name=COALESCE($1,name),email=COALESCE($2,email),phone=COALESCE($3,phone),contact_name=COALESCE($4,contact_name) WHERE id=$5 RETURNING id,name,email,phone,contact_name AS "contactName"',[d.name??null,d.email??null,d.phone??null,d.contactName??null,supplierId]);if(!rows[0])throw new NotFoundException();return rows[0];}
}
@Module({controllers:[ProductsController,CategoriesController,SuppliersController,HealthControllerFactory(()=>db.query('SELECT 1'))]}) export class AppModule {}
