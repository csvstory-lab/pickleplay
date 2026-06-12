/**
 * supabase/20_posts_category_slugs.sql 적용 (로컬 1회 실행용)
 * pass_supabase.txt 또는 SUPABASE_DB_PASSWORD 환경변수 사용
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectRef = 'jszgznanptutwxcsnrep';

function readPassword() {
  if (process.env.SUPABASE_DB_PASSWORD) {
    return process.env.SUPABASE_DB_PASSWORD.trim();
  }
  const passFile = path.join(root, 'pass_supabase.txt');
  if (fs.existsSync(passFile)) {
    return fs.readFileSync(passFile, 'utf8').trim();
  }
  throw new Error('DB 비밀번호 없음: pass_supabase.txt 또는 SUPABASE_DB_PASSWORD 필요');
}

const sqlPath = path.join(root, 'supabase', '20_posts_category_slugs.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: readPassword(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('[P!CKLE] Connected. Applying 20_posts_category_slugs.sql ...');
  await client.query(sql);
  const verify = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass
      AND conname = 'posts_category_check';
  `);
  const count = await client.query('SELECT COUNT(*)::int AS n FROM public.posts');
  console.log('[P!CKLE] Migration OK');
  console.log('[P!CKLE] posts rows:', count.rows[0].n);
  if (verify.rows[0]) {
    console.log('[P!CKLE] Constraint:', verify.rows[0].def);
  } else {
    console.warn('[P!CKLE] Warning: posts_category_check not found');
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[P!CKLE] Migration failed:', err.message || err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
