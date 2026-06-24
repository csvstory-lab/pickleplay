/**
 * P!CKLE — PC·모바일 공통 480px 앱 셸 (#app-container 자동 래핑)
 */
(function () {
  'use strict';

  var OUTSIDE_IDS = {
    'landscape-warning': true,
    'createSuccessOverlay': true,
    'app-container': true,
  };

  var OUTSIDE_CLASSES = ['pickle-popup-root', 'pickle-profile-modal-overlay'];

  function shouldStayOutside(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;
    if (el.id && OUTSIDE_IDS[el.id]) return true;
    if (el.hasAttribute && el.hasAttribute('data-shell-outside')) return true;
    for (var i = 0; i < OUTSIDE_CLASSES.length; i++) {
      if (el.classList && el.classList.contains(OUTSIDE_CLASSES[i])) return true;
    }
    return false;
  }

  function ensureAppContainer() {
    if (document.getElementById('app-container')) {
      return document.getElementById('app-container');
    }

    var body = document.body;
    if (!body) return null;

    var shell = document.createElement('div');
    shell.id = 'app-container';

    var toMove = [];
    Array.prototype.forEach.call(body.children, function (child) {
      if (!shouldStayOutside(child)) toMove.push(child);
    });

    if (!toMove.length) return null;

    toMove.forEach(function (child) {
      shell.appendChild(child);
    });

    var anchor = document.getElementById('landscape-warning');
    if (anchor) {
      if (anchor.nextSibling) {
        body.insertBefore(shell, anchor.nextSibling);
      } else {
        body.appendChild(shell);
      }
    } else {
      body.insertBefore(shell, body.firstChild);
    }

    return shell;
  }

  function boot() {
    ensureAppContainer();
  }

  window.PickleMobileShell = {
    ensure: ensureAppContainer,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
