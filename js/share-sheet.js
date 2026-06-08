/**
 * P!CKLE — shareSheet 바텀시트 (카카오톡 · 링크 복사 · OS 공유)
 */
(function () {
  'use strict';

  const KAKAO_SHARE_TITLE = 'P!CKLE - 불판 좌표 찍기';

  let shareContext = {
    title: KAKAO_SHARE_TITLE,
    url: window.location.href,
    description: '너의 뇌정지 선택은? 지금 바로 화력을 지원해줘! 🔥',
  };

  function setShareContext(ctx) {
    if (!ctx) return;
    shareContext = {
      title: ctx.title || shareContext.title,
      url: ctx.url || window.location.href,
      description: ctx.description || shareContext.description,
      imageUrl: ctx.imageUrl || shareContext.imageUrl,
    };
  }

  function openShareSheet(ctx) {
    if (ctx) setShareContext(ctx);
    const overlay = document.getElementById('commonOverlay');
    const sheet = document.getElementById('shareSheet');
    if (!sheet) return;

    overlay?.classList.add('open');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeShareSheet() {
    const overlay = document.getElementById('commonOverlay');
    const sheet = document.getElementById('shareSheet');
    if (!sheet) return;

    overlay?.classList.remove('open');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function getShareUrl() {
    return shareContext.url || window.location.href;
  }

  function shareKakao() {
    if (typeof Kakao === 'undefined') {
      alert('카카오 SDK가 로드되지 않았습니다.');
      return;
    }
    if (!Kakao.isInitialized()) {
      alert(
        '카카오 JavaScript 키가 설정되지 않았습니다.\nindex.html 하단 YOUR_KAKAO_JAVASCRIPT_KEY 를 확인해 주세요.'
      );
      return;
    }

    const url = getShareUrl();
    const description =
      shareContext.description ||
      `${shareContext.title || ''}\n지금 P!CKLE에서 투표하세요!`;

    try {
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: KAKAO_SHARE_TITLE,
          description: description,
          imageUrl:
            shareContext.imageUrl ||
            'https://t1.daumcdn.net/kakaobrandtalk/common/commonLogo.png',
          link: {
            mobileWebUrl: url,
            webUrl: url,
          },
        },
        buttons: [
          {
            title: '불판 좌표 찍기',
            link: {
              mobileWebUrl: url,
              webUrl: url,
            },
          },
        ],
      });
    } catch (err) {
      console.error('[P!CKLE] Kakao share failed', err);
      alert('카카오톡 공유에 실패했습니다. 키·도메인 등록을 확인해 주세요.');
    }
  }

  function copyLink() {
    const url = getShareUrl();
    const done = () => alert('링크가 복사되었습니다!');

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(done)
        .catch(() => legacyCopy(url, done));
      return;
    }
    legacyCopy(url, done);
  }

  function legacyCopy(text, onSuccess) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    } catch (err) {
      console.error('[P!CKLE] copy failed', err);
      alert('링크 복사에 실패했습니다.');
    }
  }

  function triggerNativeShare() {
    const url = getShareUrl();
    const title = shareContext.title || KAKAO_SHARE_TITLE;
    const text = shareContext.description || '너의 뇌정지 선택은? 지금 바로 화력을 지원해줘! 🔥';

    if (typeof navigator.share === 'function') {
      navigator.share({ title, text, url }).catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('[P!CKLE] native share failed', err);
        }
      });
      return;
    }
    copyLink();
  }

  function bindShareSheetButtons() {
    const sheet = document.getElementById('shareSheet');
    const overlay = document.getElementById('commonOverlay');
    if (!sheet) return;

    overlay?.addEventListener('click', closeShareSheet);

    sheet.querySelector('.btn-close-sheet')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeShareSheet();
    });

    const kakaoItem = sheet.querySelector('.share-item .icon-kakao')?.closest('.share-item');
    const linkItem = sheet.querySelector('.share-item .icon-link')?.closest('.share-item');
    const osItem = sheet.querySelector('.share-item .icon-os')?.closest('.share-item');

    kakaoItem?.addEventListener('click', (e) => {
      e.preventDefault();
      shareKakao();
    });

    linkItem?.addEventListener('click', (e) => {
      e.preventDefault();
      copyLink();
    });

    osItem?.addEventListener('click', (e) => {
      e.preventDefault();
      triggerNativeShare();
    });
  }

  window.shareKakao = shareKakao;
  window.copyLink = copyLink;
  window.openShareSheet = openShareSheet;
  window.closeShareSheet = closeShareSheet;
  window.triggerNativeShare = triggerNativeShare;

  window.PickleShareSheet = {
    setShareContext,
    openShareSheet,
    closeShareSheet,
    bindShareSheetButtons,
    shareKakao,
    copyLink,
    triggerNativeShare,
  };
})();
