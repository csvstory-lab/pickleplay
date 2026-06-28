/**
 * P!CKLE — system_settings.general_config (유저 앱 메타·점검·푸터·보호)
 */
(function () {
  'use strict';

  var SYSTEM_SETTINGS_ID = 1;
  var CACHE_KEY = 'pickle_general_config_v1';
  var INVALIDATION_KEY = 'pickle_general_config_invalidation';
  var CACHE_MS = 60 * 1000;

  var DEFAULT_GENERAL = {
    maintenance_enabled: false,
    maintenance_message:
      '안정적인 서비스 제공을 위해 시스템 점검 중입니다. (14:00~16:00)',
    auto_login_default: true,
    block_copy: true,
    block_drag: true,
    block_screenshot: false,
    favicon_url: '',
    og_image_url:
      (window.PICKLE_OG_DEFAULTS && window.PICKLE_OG_DEFAULTS.imageUrl) || '',
    meta_title: '픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티',
    meta_description: '세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!',
    meta_keywords: '투표,밸런스게임,도파민,픽클,이슈,커뮤니티,MBTI,연애상담,썰',
    naver_verification: '',
    google_verification: '',
    sns_youtube: '',
    sns_instagram: '',
    sns_tiktok: '',
    sns_kakao: '',
    sns_blog: '',
    sns_facebook: '',
    app_store_url: '',
    play_store_url: '',
    company_name: '(주)픽클컴퍼니',
    ceo_name: '홍길동',
    business_number: '123-45-67890',
    mail_order_number: '제 2026-서울성동-1234호',
    company_address: '서울특별시 성동구 뚝섬로 123, 픽클타워 7층',
  };

  var SNS_CHANNELS = [
    { key: 'sns_youtube', icon: 'ph-fill ph-youtube-logo', label: 'YouTube' },
    { key: 'sns_instagram', icon: 'ph-fill ph-instagram-logo', label: 'Instagram' },
    { key: 'sns_tiktok', icon: 'ph-fill ph-tiktok-logo', label: 'TikTok' },
    { key: 'sns_kakao', icon: 'ph-fill ph-chat-circle', label: 'Kakao' },
    { key: 'sns_blog', icon: 'ph-fill ph-article', label: 'Blog' },
    { key: 'sns_facebook', icon: 'ph-fill ph-facebook-logo', label: 'Facebook' },
  ];

  var generalConfigCache = null;
  var generalConfigCachedAt = 0;
  var initPromise = null;
  var protectionBound = false;

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) return window.supabaseClient;
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function normalizeGeneralConfig(raw) {
    var merged = Object.assign({}, DEFAULT_GENERAL, raw && typeof raw === 'object' ? raw : {});
    if (!merged.og_image_url && window.PICKLE_OG_DEFAULTS && window.PICKLE_OG_DEFAULTS.imageUrl) {
      merged.og_image_url = window.PICKLE_OG_DEFAULTS.imageUrl;
    }
    return merged;
  }

  function readSessionCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || Date.now() - (parsed.at || 0) > CACHE_MS) return null;
      return normalizeGeneralConfig(parsed.data);
    } catch (e) {
      return null;
    }
  }

  function writeSessionCache(cfg) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), data: cfg })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function clearSessionCache() {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch (e) {
      /* ignore */
    }
    generalConfigCache = null;
    generalConfigCachedAt = 0;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function currentPageFile() {
    return (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function isMaintenanceExemptPage() {
    var file = currentPageFile();
    return (
      file === 'maintenance.html' ||
      file === 'login.html' ||
      file === 'reset_password.html'
    );
  }

  function isKeepPageTitle() {
    return document.body && document.body.getAttribute('data-keep-page-title') === 'true';
  }

  function upsertMetaByName(name, content) {
    if (!content) return;
    var el = document.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function upsertMetaByProperty(property, content) {
    if (!content) return;
    var el = document.querySelector('meta[property="' + property + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function applyFavicon(url) {
    if (!url) return;
    var link =
      document.querySelector('link[rel="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  }

  function applyHeadMeta(cfg, overrides) {
    var o = overrides || {};
    var title = o.title || cfg.meta_title || DEFAULT_GENERAL.meta_title;
    var description =
      o.description || cfg.meta_description || DEFAULT_GENERAL.meta_description;
    var keywords = o.keywords || cfg.meta_keywords || DEFAULT_GENERAL.meta_keywords;
    var image = o.image || cfg.og_image_url || '';
    var url = o.url || window.location.href;

    if (!isKeepPageTitle()) {
      document.title = title;
    }

    upsertMetaByName('description', description);
    upsertMetaByName('keywords', keywords);
    upsertMetaByProperty('og:title', title);
    upsertMetaByProperty('og:description', description);
    upsertMetaByProperty('og:site_name', 'P!CKLE');
    upsertMetaByProperty('og:type', o.type || 'website');
    upsertMetaByProperty('og:url', url);
    if (image) upsertMetaByProperty('og:image', image);

    upsertMetaByName('twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMetaByName('twitter:title', title);
    upsertMetaByName('twitter:description', description);
    if (image) upsertMetaByName('twitter:image', image);

    if (cfg.naver_verification) {
      upsertMetaByName('naver-site-verification', cfg.naver_verification);
    }
    if (cfg.google_verification) {
      upsertMetaByName('google-site-verification', cfg.google_verification);
    }

    applyFavicon(cfg.favicon_url);
  }

  function redirectToMaintenance(message) {
    if (isMaintenanceExemptPage()) return;
    var qs = message ? '?msg=' + encodeURIComponent(message) : '';
    var target = 'maintenance.html' + qs;
    if (currentPageFile() === 'maintenance.html') return;
    window.location.replace(target);
  }

  function enforceMaintenance(cfg) {
    if (!cfg || !cfg.maintenance_enabled) return;
    if (isMaintenanceExemptPage()) return;
    redirectToMaintenance(
      cfg.maintenance_message || DEFAULT_GENERAL.maintenance_message
    );
  }

  function applyContentProtection(cfg) {
    if (protectionBound) return;
    protectionBound = true;

    if (cfg.block_copy) {
      document.addEventListener(
        'copy',
        function (e) {
          e.preventDefault();
        },
        true
      );
      document.addEventListener(
        'contextmenu',
        function (e) {
          var tag = e.target && e.target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
        },
        true
      );
    }

    if (cfg.block_drag) {
      document.addEventListener(
        'dragstart',
        function (e) {
          e.preventDefault();
        },
        true
      );
    }

    if (cfg.block_screenshot) {
      document.body && document.body.classList.add('pickle-no-screenshot');
    }
  }

  function applyCompanyFooter(cfg) {
    var titleEl = document.getElementById('companyAccordionTitle');
    var bodyEl = document.getElementById('companyAccordionBody');
    var companyName = cfg.company_name || DEFAULT_GENERAL.company_name;

    if (titleEl) {
      titleEl.textContent = companyName + ' 사업자 정보';
    }

    if (bodyEl) {
      var lines = [];
      if (cfg.ceo_name) lines.push('대표: ' + cfg.ceo_name);
      if (cfg.business_number) lines.push('사업자등록번호: ' + cfg.business_number);
      if (cfg.company_address) lines.push('주소: ' + cfg.company_address);
      if (cfg.mail_order_number) {
        lines.push('통신판매업신고번호: ' + cfg.mail_order_number);
      }
      bodyEl.innerHTML = lines.map(escapeHtml).join('<br>');
    }
  }

  function applySnsLinks(cfg) {
    var root = document.getElementById('siteSnsLinks');
    if (!root) return;

    var items = SNS_CHANNELS.filter(function (ch) {
      return !!(cfg[ch.key] && String(cfg[ch.key]).trim());
    });

    if (!items.length) {
      root.innerHTML = '';
      root.hidden = true;
      return;
    }

    root.hidden = false;
    root.innerHTML = items
      .map(function (ch) {
        var href = String(cfg[ch.key]).trim();
        return (
          '<a class="site-sns-link" href="' +
          escapeAttr(href) +
          '" target="_blank" rel="noopener noreferrer" aria-label="' +
          escapeAttr(ch.label) +
          '"><i class="' +
          ch.icon +
          '" aria-hidden="true"></i></a>'
        );
      })
      .join('');
  }

  function applyAll(cfg) {
    var normalized = normalizeGeneralConfig(cfg);
    generalConfigCache = normalized;
    generalConfigCachedAt = Date.now();
    writeSessionCache(normalized);

    enforceMaintenance(normalized);
    if (normalized.maintenance_enabled && !isMaintenanceExemptPage()) return normalized;

    applyHeadMeta(normalized);
    applyContentProtection(normalized);
    applyCompanyFooter(normalized);
    applySnsLinks(normalized);
    return normalized;
  }

  async function fetchGeneralConfig(options) {
    var forceRefresh = options && options.forceRefresh === true;
    var now = Date.now();

    if (!forceRefresh && generalConfigCache && now - generalConfigCachedAt < CACHE_MS) {
      return generalConfigCache;
    }

    if (!forceRefresh) {
      var cached = readSessionCache();
      if (cached) {
        generalConfigCache = cached;
        generalConfigCachedAt = now;
        return cached;
      }
    }

    var sb = getClient();
    var res = await sb
      .from('system_settings')
      .select('general_config')
      .eq('id', SYSTEM_SETTINGS_ID)
      .single();

    if (res.error) {
      if (res.error.code === 'PGRST116') {
        console.warn(
          '[P!CKLE SystemSettings] system_settings(id=1) 없음 — supabase/61_system_settings.sql 실행 필요'
        );
        return normalizeGeneralConfig({});
      }
      throw res.error;
    }

    var cfg = normalizeGeneralConfig(
      res.data && res.data.general_config ? res.data.general_config : {}
    );
    generalConfigCache = cfg;
    generalConfigCachedAt = now;
    writeSessionCache(cfg);
    return cfg;
  }

  async function init(options) {
    if (initPromise && !(options && options.forceRefresh)) {
      return initPromise;
    }

    initPromise = (async function () {
      try {
        var cached = readSessionCache();
        if (cached) {
          enforceMaintenance(cached);
          if (cached.maintenance_enabled && !isMaintenanceExemptPage()) {
            return cached;
          }
        }

        var cfg = await fetchGeneralConfig(options);
        return applyAll(cfg);
      } catch (err) {
        console.error('[P!CKLE SystemSettings] 초기화 실패', err);
        return normalizeGeneralConfig({});
      }
    })();

    return initPromise;
  }

  function updateOpenGraph(overrides) {
    var base = generalConfigCache || normalizeGeneralConfig({});
    applyHeadMeta(base, overrides || {});
  }

  function getGeneralConfig() {
    return generalConfigCache || normalizeGeneralConfig({});
  }

  function getAutoLoginDefault() {
    return !!getGeneralConfig().auto_login_default;
  }

  window.addEventListener('storage', function (e) {
    if (e.key === INVALIDATION_KEY) {
      clearSessionCache();
      init({ forceRefresh: true });
    }
  });

  window.PickleSystemSettings = {
    init: init,
    fetchGeneralConfig: fetchGeneralConfig,
    applyAll: applyAll,
    applyHeadMeta: applyHeadMeta,
    updateOpenGraph: updateOpenGraph,
    getGeneralConfig: getGeneralConfig,
    getAutoLoginDefault: getAutoLoginDefault,
    clearCache: clearSessionCache,
    DEFAULT_GENERAL: DEFAULT_GENERAL,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }
})();
