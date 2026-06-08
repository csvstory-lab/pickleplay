/**
 * P!CKLE Admin — Firebase 초기화 (App + Analytics + Firestore)
 * 모든 관리자 HTML <head> 에서 <script type="module" src="js/firebase-init.js"></script> 로 로드
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js';
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDv9jmurAZxXyqL6jjzEwb661SoFGeS7SA',
  authDomain: 'pickle-admin-f7111.firebaseapp.com',
  projectId: 'pickle-admin-f7111',
  storageBucket: 'pickle-admin-f7111.firebasestorage.app',
  messagingSenderId: '540021172743',
  appId: '1:540021172743:web:4fe8ce12fcc4bdc1dd58a2',
  measurementId: 'G-35G6ZG97SC',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn('[P!CKLE Admin] Analytics 초기화 생략:', e.message);
}

async function logAction(colName, docId, action, data, page) {
  await addDoc(collection(db, 'admin_logs'), {
    collection: colName,
    docId: docId || null,
    action,
    page: page || colName,
    data,
    createdAt: serverTimestamp(),
  });
}

async function persist(colName, docId, data, opts = {}) {
  try {
    const payload = { ...data, updatedAt: serverTimestamp() };
    if (opts.createdAt) payload.createdAt = serverTimestamp();
    await setDoc(doc(db, colName, docId), payload, { merge: opts.merge !== false });
    if (!opts.skipLog) {
      await logAction(colName, docId, opts.action || 'save', data, opts.page);
    }
    if (opts.successMessage) alert(opts.successMessage);
    return { ok: true };
  } catch (err) {
    console.error('[P!CKLE Admin] 저장 실패:', err);
    alert('저장 실패: ' + (err.message || err));
    return { ok: false, error: err };
  }
}

async function persistNew(colName, data, opts = {}) {
  try {
    const ref = await addDoc(collection(db, colName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (!opts.skipLog) {
      await logAction(colName, ref.id, opts.action || 'create', data, opts.page);
    }
    if (opts.successMessage) alert(opts.successMessage);
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error('[P!CKLE Admin] 저장 실패:', err);
    alert('저장 실패: ' + (err.message || err));
    return { ok: false, error: err };
  }
}

async function load(colName, docId) {
  const snap = await getDoc(doc(db, colName, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function loadList(colName, opts = {}) {
  const max = opts.limit || 50;
  const q = query(collection(db, colName), orderBy('updatedAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function collectForm(scope) {
  const root = typeof scope === 'string' ? document.querySelector(scope) : scope || document;
  const fields = {};
  const checkboxes = {};
  root.querySelectorAll('input, select, textarea').forEach((el, i) => {
    const key = el.id || el.name || 'field_' + i;
    if (el.type === 'checkbox') checkboxes[key] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) fields[el.name || key] = el.value;
    } else if (el.type !== 'file' && el.type !== 'button' && el.type !== 'submit') {
      fields[key] = el.value;
    }
  });
  return { fields, checkboxes };
}

function collectKeywords(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return [...container.querySelectorAll('.kw-tag')].map((tag) => {
    const text = tag.cloneNode(true);
    text.querySelector('.kw-close')?.remove();
    return text.textContent.trim();
  });
}

function collectPrizeTiers() {
  return [...document.querySelectorAll('#prizeContainer .prize-row')].map((row) => {
    const inputs = row.querySelectorAll('input');
    return {
      name: inputs[0]?.value?.trim() || '',
      count: inputs[1]?.value?.trim() || '',
    };
  });
}

function slugify(text) {
  return (
    String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w\uac00-\ud7a3_-]/g, '')
      .slice(0, 48) || 'item_' + Date.now()
  );
}

function applyLoadedData(data) {
  if (!data) return;
  const { fields = {}, keywords, selects } = data;
  const checkboxes = data.checkboxes || data.toggles || {};

  Object.entries(fields).forEach(([key, value]) => {
    const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
    if (el && el.type !== 'checkbox' && el.type !== 'radio') el.value = value;
  });

  Object.entries(checkboxes).forEach(([key, checked]) => {
    const el = document.getElementById(key);
    if (el && el.type === 'checkbox') el.checked = !!checked;
  });

  if (Array.isArray(keywords)) {
    const container = document.getElementById('keywordContainer');
    if (container) {
      container.innerHTML = '';
      keywords.forEach((word, i) => {
        const tagDiv = document.createElement('div');
        tagDiv.className = 'kw-tag';
        tagDiv.id = 'kw' + (i + 1);
        tagDiv.innerHTML = `${word} <span class="kw-close" onclick="removeKeyword('${tagDiv.id}')">✕</span>`;
        container.appendChild(tagDiv);
      });
    }
  }

  if (selects && typeof selects === 'object') {
    document.querySelectorAll('.ai-select').forEach((sel, i) => {
      const val = selects['ai_select_' + i];
      if (val !== undefined) sel.value = val;
    });
  }
}

async function autoLoadPageData() {
  const page = document.body.dataset.firebasePage;
  const docId = document.body.dataset.firebaseDoc || 'settings';
  if (!page) return;
  try {
    const data = await load(page, docId);
    if (data) applyLoadedData(data);
    console.info(`[P!CKLE Admin] Firestore 로드 완료: ${page}/${docId}`);
  } catch (e) {
    console.warn('[P!CKLE Admin] 페이지 데이터 로드 실패:', e.message);
  }
}

window.PickleFirebase = { app, db, analytics, config: firebaseConfig };
window.PickleAdminFirebase = {
  app,
  db,
  analytics,
  persist,
  persistNew,
  load,
  loadList,
  collectForm,
  collectKeywords,
  collectPrizeTiers,
  slugify,
  applyLoadedData,
  serverTimestamp,
};

document.addEventListener('DOMContentLoaded', () => {
  console.info('[P!CKLE Admin] Firebase Firestore 준비 완료');
  autoLoadPageData();
});
