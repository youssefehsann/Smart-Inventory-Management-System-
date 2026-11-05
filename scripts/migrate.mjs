import 'dotenv/config';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
const names = ['auth','catalog','inventory','notifications','reporting'];
const adminURL = process.env.POSTGRES_ADMIN_URL;
if (!adminURL) throw new Error('Set POSTGRES_ADMIN_URL in .env');
const admin = new Client({ connectionString: adminURL });
await admin.connect();
try {
  for (const name of names) {
    const dbName = `smart_${name}`;
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbName]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
    const url = new URL(adminURL); url.pathname = `/${dbName}`;
    const db = new Client({connectionString:url.toString()}); await db.connect();
    try { await db.query(await readFile(new URL(`../database/migrations/${name}.sql`,import.meta.url),'utf8')); }
    finally { await db.end(); }
    console.log(`✓ migrated ${dbName}`);
  }
} finally { await admin.end(); }
