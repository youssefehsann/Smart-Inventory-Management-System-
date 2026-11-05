import 'dotenv/config';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
const db = async (key) => { const c = new Client({connectionString:process.env[key]}); await c.connect();return c;};
const auth=await db('AUTH_DATABASE_URL');const catalog=await db('CATALOG_DATABASE_URL');const inventory=await db('INVENTORY_DATABASE_URL');
try {
  const email=process.env.ADMIN_EMAIL, pass=process.env.ADMIN_PASSWORD;
  if (!email||!pass||pass.length<12) throw Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ characters)');
  await auth.query(`INSERT INTO users(id,email,full_name,password_hash,role) VALUES ($1,$2,$3,$4,'admin') ON CONFLICT(email) DO NOTHING`, [randomUUID(),email.toLowerCase(),'System Administrator',await bcrypt.hash(pass,12)]);
  const categories = ['Electronics','Office Essentials','Storage & Supplies','Furniture','Accessories'];
  for (const name of categories) await catalog.query('INSERT INTO categories(id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[randomUUID(),name]);
  const categoryRows=await catalog.query('SELECT id,name FROM categories');const cat=Object.fromEntries(categoryRows.rows.map(r=>[r.name,r.id]));
  await catalog.query(`INSERT INTO suppliers(id,name,email,phone,contact_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[randomUUID(),'Northstar Distribution','orders@northstar.example','+1 555 0101','Amelia Ross']);
  const supplier=(await catalog.query('SELECT id FROM suppliers LIMIT 1')).rows[0]?.id;
  await inventory.query(`INSERT INTO warehouses(id,name,code,location) VALUES($1,'North Hub','WH-NORTH','New York, USA') ON CONFLICT(code) DO NOTHING`,[randomUUID()]);
  await inventory.query(`INSERT INTO warehouses(id,name,code,location) VALUES($1,'West Distribution','WH-WEST','California, USA') ON CONFLICT(code) DO NOTHING`,[randomUUID()]);
  const items=[
    ['ELC-1001','Wireless Keyboard','Low-profile wireless keyboard', 'Electronics',89,'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&q=80',156],
    ['ELC-1002','Studio Headphones','Premium over-ear headphones','Electronics',179,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',42],
    ['OFF-2001','Minimal Desk Lamp','Adjustable aluminum desk lamp','Office Essentials',64,'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500&q=80',8],
    ['STO-3001','Storage Organizer','Modular desk organizer','Storage & Supplies',34,'https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&q=80',84],
    ['FUR-4001','Ergonomic Office Chair','Adjustable breathable mesh chair','Furniture',299,'https://images.unsplash.com/photo-1598300053653-dab92c5c8c47?w=500&q=80',23],
    ['ACC-5001','Wireless Mouse','Precision Bluetooth mouse','Accessories',49,'https://images.unsplash.com/photo-1527814050087-3793815479db?w=500&q=80',7],
    ['ELC-1003','27-inch Monitor','4K IPS display for professionals','Electronics',429,'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&q=80',61],
    ['OFF-2002','Paper Notebook Set','Recycled dotted paper notebooks','Office Essentials',18,'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=500&q=80',110]
  ];
  for (const [sku,name,description,category,unitPrice,image,quantity] of items) {
    const result=await catalog.query('INSERT INTO products(id,sku,name,description,category_id,supplier_id,unit_price,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name RETURNING id',[randomUUID(),sku,name,description,cat[category],supplier,unitPrice,image]);
    const w=(await inventory.query('SELECT id FROM warehouses WHERE code=$1',['WH-NORTH'])).rows[0];
    if (!w) continue;
    const productId=result.rows[0].id;
    const created=await inventory.query('INSERT INTO stock(product_id,warehouse_id,quantity,reorder_level) VALUES($1,$2,$3,15) ON CONFLICT(product_id,warehouse_id) DO NOTHING RETURNING product_id',[productId,w.id,quantity]);
    if (created.rowCount) {
      await inventory.query('INSERT INTO movements(id,product_id,warehouse_id,delta,after_quantity,reason) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),productId,w.id,quantity,quantity,'Opening inventory balance']);
      if(quantity<=15) {
        const eventId=randomUUID();
        await inventory.query('INSERT INTO outbox(id,name,payload) VALUES($1,$2,$3)',[eventId,'STOCK_LOW',JSON.stringify({eventId,productId,warehouseId:w.id,quantity,reorderLevel:15,occurredAt:new Date().toISOString()})]);
      }
    }
  }
  console.log('✓ seeded admin, products and stock; rerunning seed is safe');
}finally{await Promise.all([auth.end(),catalog.end(),inventory.end()]);}
