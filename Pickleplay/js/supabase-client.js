/**
 * P!CKLE — Supabase 공통 클라이언트
 *
 * HTML에서 아래 순서로 script 를 넣은 뒤 사용하세요.
 * 1) @supabase/supabase-js (CDN)
 * 2) supabase-config.js
 * 3) supabase-client.js
 *
 * 사용 예:
 *   const sb = window.PickleSupabase.getClient();
 *   const { data, error } = await sb.from('faqs').select('*');
 */
(function () {
  'use strict';

  function normalizeSupabaseUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
  }

  function readConfig() {
    const cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error(
        '[P!CKLE] supabase-config.js 가 없거나 url/anonKey 가 비어 있습니다. ' +
          'js/supabase-config.example.js 를 복사해 supabase-config.js 를 만드세요.'
      );
    }
    return {
      url: normalizeSupabaseUrl(cfg.url),
      anonKey: String(cfg.anonKey).trim(),
    };
  }

  let cachedClient = null;

  function getClient() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error(
        '[P!CKLE] Supabase JS 라이브러리가 로드되지 않았습니다. ' +
          'HTML에 @supabase/supabase-js CDN script 가 먼저 있는지 확인하세요.'
      );
    }

    if (!cachedClient) {
      const { url, anonKey } = readConfig();
      cachedClient = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }

    return cachedClient;
  }

  /** DB 연결 테스트 — cs_settings 1건 조회 (공개 읽기 허용 테이블) */
  async function testConnection() {
    const sb = getClient();
    const { data, error } = await sb
      .from('cs_settings')
      .select('id, kakao_channel_name, cs_email')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      return { ok: false, error };
    }

    return { ok: true, data };
  }

  window.PickleSupabase = {
    getClient,
    testConnection,
    getProjectUrl: readConfig().url,
  };
})();
