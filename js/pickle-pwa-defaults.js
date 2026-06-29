/**
 * P!CKLE — PWA · 홈 화면 추가 아이콘 기본값
 * 관리자 파비콘 업로드 시 system_assets/favicon/default_favicon.* 로 덮어씁니다.
 */
(function () {
  'use strict';

  var SUPABASE_PROJECT_REF = 'jszgznanptutwxcsnrep';
  var STORAGE_PUBLIC_BASE =
    'https://' +
    SUPABASE_PROJECT_REF +
    '.supabase.co/storage/v1/object/public/system_assets';

  window.PICKLE_PWA_DEFAULTS = {
    faviconUrl: STORAGE_PUBLIC_BASE + '/favicon/default_favicon.png',
    manifestUrl: '/manifest.json',
    themeColor: '#0a0a0c',
    backgroundColor: '#0a0a0c',
    appTitle: 'P!CKLE',
    shortName: 'P!CKLE',
  };
})();
