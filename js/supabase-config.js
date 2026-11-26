/**
 * P!CKLE Supabase 연결 정보
 * + 전역 Singleton 클라이언트 (window.supabaseClient)
 *
 * 주의: 아래 anonKey는 "공개용 anon 키"로, 브라우저에 노출되고 Git에 올라가도
 * 안전하도록 설계된 값입니다 (실제 접근 제어는 Supabase의 RLS 정책이 담당합니다).
 * 반드시 anon 키만 넣어야 하며, service_role 키(관리자 전용, 모든 권한 우회)는
 * 절대 이 파일이나 어떤 프론트엔드 파일에도 넣으면 안 됩니다.
 *
 * HTML script 순서:
 *   1) @supabase/supabase-js CDN
 *   2) supabase-config.js
 */
window.PICKLE_SUPABASE_CONFIG = {
  url: 'https://jszgznanptutwxcsnrep.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzemd6bmFucHR1dHd4Y3NucmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDc1MjIsImV4cCI6MjA5NjA4MzUyMn0.Czo-Cmw7JQktWMV77KSt2Yk3Pnkx89ZE1Ey0C0dk1G4',
};

(function () {
  'use strict';

  function normalizeSupabaseUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
  }

  /**
   * GoTrueClient 단일 인스턴스 반환 (없으면 1회만 생성)
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  function getPickleSupabaseClient() {
    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    var cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error(
        '[P!CKLE] supabase-config.js 가 없거나 url/anonKey 가 비어 있습니다.'
      );
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error(
        '[P!CKLE] @supabase/supabase-js 가 로드되지 않았습니다. CDN script 순서를 확인해 주세요.'
      );
    }

    window.supabaseClient = window.supabase.createClient(
      normalizeSupabaseUrl(cfg.url),
      String(cfg.anonKey).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    return window.supabaseClient;
  }

  window.getPickleSupabaseClient = getPickleSupabaseClient;
})();
