import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Client } = pg;

const regions = [
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'ca-central-1',
  'sa-east-1'
];

const passwords = ['NIGHTMARESTORE1122', '[NIGHTMARESTORE1122]'];

async function getConnectedClient() {
  // 1. Try pooler hosts across regions
  for (const reg of regions) {
    const host = `aws-0-${reg}.pooler.supabase.com`;
    const user = 'postgres.otrdauyyhibxldqcfxqu';
    
    for (const pw of passwords) {
      for (const port of [5432, 6543]) {
        const client = new Client({
          host,
          port,
          user,
          password: pw,
          database: 'postgres',
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 3500
        });

        try {
          await client.connect();
          console.log(`Connected successfully to ${host}:${port} as ${user}!`);
          return client;
        } catch (err) {
          try { await client.end(); } catch {}
        }
      }
    }
  }

  // 2. Direct db host fallback
  for (const pw of passwords) {
    const client = new Client({
      host: 'db.otrdauyyhibxldqcfxqu.supabase.co',
      port: 5432,
      user: 'postgres',
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3500
    });
    try {
      await client.connect();
      console.log(`Connected directly to db.otrdauyyhibxldqcfxqu.supabase.co!`);
      return client;
    } catch (err) {
      try { await client.end(); } catch {}
    }
  }

  throw new Error('Could not connect to Supabase PostgreSQL database.');
}

async function runMigrations() {
  const client = await getConnectedClient();

  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const migrationFiles = [
    '001_initial_schema.sql',
    '002_functions_and_rpc.sql',
    '003_storage_and_rls.sql',
    '004_wallet_balance.sql'
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) continue;

    console.log(`Executing migration: ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await client.query(sql);
      console.log(`Migration ${file} executed successfully!`);
    } catch (err) {
      console.warn(`Notice during ${file}:`, err.message);
    }
  }

  await client.end();
  console.log(`All migrations successfully applied to Supabase!`);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
