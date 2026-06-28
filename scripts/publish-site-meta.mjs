/**
 * DB general_config → site_meta.json (Storage) 배포
 * 사용: node scripts/publish-site-meta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPublishedMetaPayload,
  normalizeSiteMeta,
  DEFAULT_SITE_META,
} from './site-meta-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'system_assets';
const OBJECT_PATH = 'site_meta.json';

function readSupabaseConfig() {
  const configPath = path.join(ROOT, 'js', 'supabase-config.js');
  const src = fs.readFileSync(configPath, 'utf8');
  const urlMatch = src.match(/url:\s*['"]([^'"]+)['"]/);
  const keyMatch = src.match(/anonKey:\s*['"]([^'"]+)['"]/);
  if (!urlMatch || !keyMatch) throw new Error('supabase-config.js 파싱 실패');
  return { url: urlMatch[1].replace(/\/$/, ''), anonKey: keyMatch[1] };
}

async function loadGeneralConfig(cfg) {
  const apiUrl = cfg.url + '/rest/v1/system_settings?id=eq.1&select=general_config';
  const res = await fetch(apiUrl, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error('DB 조회 실패: ' + res.status);
  const rows = await res.json();
  return normalizeSiteMeta((rows && rows[0] && rows[0].general_config) || DEFAULT_SITE_META);
}

async function uploadJson(cfg, payload) {
  const body = JSON.stringify(payload, null, 2);
  const uploadUrl =
    cfg.url + '/storage/v1/object/' + BUCKET + '/' + OBJECT_PATH;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Storage 업로드 실패: ' + res.status + ' ' + text);
  }
}

const supabase = readSupabaseConfig();
const general = await loadGeneralConfig(supabase);
const payload = buildPublishedMetaPayload(general);

console.log('[publish-site-meta] meta_title:', payload.meta_title);
console.log('[publish-site-meta] meta_description:', payload.meta_description);

await uploadJson(supabase, payload);
console.log('[publish-site-meta] uploaded:', BUCKET + '/' + OBJECT_PATH);
