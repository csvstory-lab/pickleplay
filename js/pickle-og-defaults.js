/**
 * P!CKLE — 정적 OG 메타 기본값 (HTML <head> 하드코딩 · JS fallback 공통)
 * 관리자 OG 이미지 업로드 시 system_assets/og/default_og.* 로 덮어씁니다.
 */
(function () {
  'use strict';

  var SUPABASE_PROJECT_REF = 'jszgznanptutwxcsnrep';
  var STORAGE_PUBLIC_BASE =
    'https://' +
    SUPABASE_PROJECT_REF +
    '.supabase.co/storage/v1/object/public/system_assets';

  window.PICKLE_OG_DEFAULTS = {
    title: '픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티',
    description: '세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!',
    keywords: '투표,밸런스게임,도파민,픽클,이슈,커뮤니티,MBTI,연애상담,썰',
    siteName: 'P!CKLE',
    imageUrl: STORAGE_PUBLIC_BASE + '/og/default_og.png',
    siteOrigin: 'https://pickleplay.kr',
  };
})();
