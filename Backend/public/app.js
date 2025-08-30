// frontend/app.js

console.log("app.js loaded OK");

// -------- Small API helper --------
async function api(path, method = 'GET', data = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

// -------- Auth helpers --------
function saveUser(u) { localStorage.setItem('user', JSON.stringify(u)); }
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }
function logout() { localStorage.removeItem('user'); window.location = 'index.html'; }
function requireAuth() { if (!getUser()) window.location = 'login.html'; }

// ===============================================
// Main boot
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
  const msg = document.getElementById('msg');
    // =========================
  // THEME (dark/light)
  // =========================
  const themeToggleBtn = document.getElementById('themeToggle');

  // decide initial theme:
  // 1) saved choice in localStorage
  // 2) else respect system preference
  function getInitialTheme(){
    const saved = localStorage.getItem('theme'); // "light" | "dark" | null
    if (saved === 'light' || saved === 'dark') return saved;
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  function applyTheme(theme){
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme','light');
      if (themeToggleBtn) themeToggleBtn.textContent = '🌙'; // show moon (switch to dark)
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = '🌓'; // show half-moon (switch to light)
    }
  }

  let currentTheme = getInitialTheme();
  applyTheme(currentTheme);

  if (themeToggleBtn){
    themeToggleBtn.addEventListener('click', () => {
      currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
      applyTheme(currentTheme);
      try { localStorage.setItem('theme', currentTheme); } catch {}
    });
  }

  // ... your code ...

  // ----- NAV visibility + message badge -----
  const navSignup = document.getElementById('navSignup');
  const navLogin = document.getElementById('navLogin');
  const navProfile = document.getElementById('navProfile');
  const navMessages = document.getElementById('navMessages');
  const navBadge = document.getElementById('navMessagesBadge');
  const logoutBtn = document.getElementById('logoutBtn');

  function setVisible(el, on=true){ if (!el) return; el.classList.toggle('hide', !on); }

  // show/hide nav items based on auth
  const me = getUser();
  setVisible(navSignup, !me);
  setVisible(navLogin, !me);
  setVisible(navProfile, !!me);
  setVisible(navMessages, !!me);
  setVisible(logoutBtn, !!me);
  if (logoutBtn) logoutBtn.onclick = logout;

  // simple "new messages since last seen" badge (no DB change)
  async function updateMsgBadge() {
    if (!me || !navBadge) return;
    try {
      const rows = await api('/messages?user_id=' + me.id);
      // get last seen timestamp from localStorage (ISO string)
      const lastSeen = localStorage.getItem('messages_last_seen');
      let count = 0;
      if (!lastSeen) {
        // first time we show all messages addressed to me
        count = rows.filter(r => r.to_username === me.username).length;
      } else {
        const since = new Date(lastSeen);
        count = rows.filter(r =>
          r.to_username === me.username &&
          r.created_at && new Date(r.created_at) > since
        ).length;
      }
      if (count > 0) {
        navBadge.textContent = String(count);
        setVisible(navBadge, true);
      } else {
        setVisible(navBadge, false);
      }
    } catch (e) {
      // ignore errors for badge
      setVisible(navBadge, false);
    }
  }

  // when landing on messages page, mark as seen
  if (document.location.pathname.endsWith('/messages.html')) {
    try { localStorage.setItem('messages_last_seen', new Date().toISOString()); } catch {}
  }

  // initial badge update + polling
  await updateMsgBadge();
  setInterval(updateMsgBadge, 15000); // every 15s

  // ---------------------------------------------
  // SIGNUP PAGE
  // ---------------------------------------------
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        if (!username || !password) throw new Error('Please fill both fields.');
        const user = await api('/signup', 'POST', { username, password });
        saveUser(user);
        if (msg) msg.textContent = `Welcome, ${user.username}! Redirecting…`;
        setTimeout(() => (location.href = 'profile.html'), 700);
      } catch (err) {
        if (msg) msg.textContent = 'Signup failed: ' + err.message;
      }
    });
  }

  // ---------------------------------------------
  // LOGIN PAGE
  // ---------------------------------------------
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        if (!username || !password) throw new Error('Please fill both fields.');
        const user = await api('/login', 'POST', { username, password });
        saveUser(user);
        if (msg) msg.textContent = `Logged in as ${user.username}. Redirecting…`;
        setTimeout(() => (location.href = 'profile.html'), 500);
      } catch (err) {
        if (msg) msg.textContent = 'Login failed: ' + err.message;
      }
    });
  }

  // ---------------------------------------------
// HOMEPAGE: Latest posts + Search
// ---------------------------------------------
const skillsList = document.getElementById('skillsList');
const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');
const clearBtn    = document.getElementById('clearBtn');
const searchMsg   = document.getElementById('searchMsg');

if (skillsList) {
  console.log("Search wiring OK"); // debug

  let allSkills = [];

  const render = (rows) => {
    if (!rows || rows.length === 0) {
      skillsList.innerHTML = '<p>No skills found.</p>';
      return;
    }
    skillsList.innerHTML = rows.map((s) => `
      <div class="card">
        <div class="card-title">@${escapeHtml(s.username)}</div>
        <div class="chip">Offers: ${escapeHtml(s.offer)}</div>
        <div class="chip">Wants: ${escapeHtml(s.want)}</div>
      </div>
    `).join('');
  };

  const runFilter = () => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    if (searchMsg) searchMsg.textContent = q ? `Searching for “${q}”...` : '';
    if (!q) { render(allSkills); return; }
    const filtered = allSkills.filter((s) =>
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.offer && s.offer.toLowerCase().includes(q)) ||
      (s.want && s.want.toLowerCase().includes(q))
    );
    render(filtered);
  };

  try {
    allSkills = await api('/skills');   // loads once
    render(allSkills);
  } catch (e) {
    skillsList.innerHTML = '<p>Could not load skills.</p>';
    if (searchMsg) searchMsg.textContent = 'Error loading list.';
  }

  if (searchInput) {
    searchInput.addEventListener('input', runFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runFilter(); }
    });
  }
  if (searchBtn)  searchBtn.addEventListener('click', runFilter);
  if (clearBtn)   clearBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (searchMsg) searchMsg.textContent = '';
    render(allSkills);
  });
}


  // ---------------------------------------------
  // PROFILE PAGE: Post a skill + My posts + Matches
  // ---------------------------------------------
  const postForm = document.getElementById('postSkillForm');
  if (postForm) {
    requireAuth();
    const u = getUser();

    const who = document.getElementById('whoami');
    if (who) who.textContent = u?.username || '';

    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const offer = document.getElementById('offer').value.trim();
        const want = document.getElementById('want').value.trim();
        if (!offer || !want) {
          if (msg) msg.textContent = 'Please fill both fields.';
          return;
        }
        if (offer.length > 100 || want.length > 100) {
          if (msg) msg.textContent = 'Keep each field under 100 characters.';
          return;
        }
        await api('/skills', 'POST', { user_id: u.id, offer, want });
        if (msg) msg.textContent = 'Posted! Refreshing…';
        postForm.reset();
        await loadMySkills();
        await loadMatchesWantMyOffer();
        await loadMatchesOfferMyWant();
      } catch (err) {
        if (msg) msg.textContent = 'Post failed: ' + err.message;
      }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // initial loads on profile
    await loadMySkills();
    await loadMatchesWantMyOffer();
    await loadMatchesOfferMyWant();
  }

  // ----- Matching helpers (smart keyword overlap) -----
  function keywords(str = '') {
    const raw = String(str).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const stop = new Set(['the','a','an','for','and','with','of','to','in','on','at','basic','beginner','help','lesson','lessons','class','classes','course','courses','level']);
    const norm = raw.map(w => w.endsWith('s') ? w.slice(0, -1) : w);
    return norm.filter(w => !stop.has(w));
  }
  function overlaps(strA = '', strB = '') {
    const A = new Set(keywords(strA));
    const B = new Set(keywords(strB));
    for (const w of A) if (B.has(w)) return true;
    return false;
  }

  // ----- Helpers used on Profile -----
  async function loadMySkills() {
    const u = getUser();
    const mySkillsDiv = document.getElementById('mySkills');
    if (!mySkillsDiv) return;
    try {
      const all = await api('/skills');
      const mine = all.filter((x) => x.username === u.username);

      if (mine.length === 0) {
        mySkillsDiv.innerHTML = '<p>No posts yet.</p>';
        return;
      }

      mySkillsDiv.innerHTML = mine.map((s) => `
        <div class="item" id="skill-${s.id}">
          <div class="view-row">
            <strong>Offers:</strong> ${escapeHtml(s.offer)} &nbsp; — &nbsp;
            <strong>Wants:</strong> ${escapeHtml(s.want)}
            <button onclick="startEdit(${s.id}, '${jsString(s.offer)}', '${jsString(s.want)}')" style="margin-left:10px;">Edit</button>
            <button onclick="deleteSkill(${s.id})" style="margin-left:6px;">Delete</button>
          </div>
          <form class="edit-row" id="edit-form-${s.id}" style="display:none; margin-top:8px;">
            <label>Offers</label>
            <input id="edit-offer-${s.id}" value="${escapeHtml(s.offer)}" maxlength="100">
            <label>Wants</label>
            <input id="edit-want-${s.id}" value="${escapeHtml(s.want)}" maxlength="100">
            <div style="margin-top:8px;">
              <button type="button" onclick="submitEdit(${s.id})">Save</button>
              <button type="button" onclick="cancelEdit(${s.id})" style="margin-left:6px;background:#777;">Cancel</button>
            </div>
          </form>
        </div>
      `).join('');
    } catch {
      mySkillsDiv.innerHTML = '<p>Could not load your posts.</p>';
    }
  }

  // A) People who WANT what I OFFER (smart overlap)
  async function loadMatchesWantMyOffer() {
    const u = getUser();
    const box = document.getElementById('matchesWantMyOffer');
    if (!box) return;
    try {
      const all = await api('/skills');
      const mine = all.filter(x => x.username === u.username);

      const seen = new Set();
      const rows = [];

      for (const my of mine) {
        if (!my.offer) continue;
        const found = all.filter(x =>
          x.username !== u.username &&
          x.want &&
          overlaps(x.want, my.offer)
        );
        for (const f of found) {
          const key = `${f.username}|${f.want}|${f.offer}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(`
            <div class="item">
              <strong>@${escapeHtml(f.username)}</strong> wants <em>${escapeHtml(f.want)}</em>
              (and offers ${escapeHtml(f.offer)})
              <button onclick="startMessage('${jsString(f.username)}')" style="margin-left:10px;">Open Chat</button>
            </div>
          `);
        }
      }

      box.innerHTML = rows.length ? rows.join('') : '<p>No matches found yet.</p>';
    } catch {
      box.innerHTML = '<p>Could not load matches.</p>';
    }
  }

  // B) People who OFFER what I WANT (smart overlap)
  async function loadMatchesOfferMyWant() {
    const u = getUser();
    const box = document.getElementById('matchesOfferMyWant');
    if (!box) return;
    try {
      const all = await api('/skills');
      const mine = all.filter(x => x.username === u.username);

      const seen = new Set();
      const rows = [];

      for (const my of mine) {
        if (!my.want) continue;
        const found = all.filter(x =>
          x.username !== u.username &&
          x.offer &&
          overlaps(x.offer, my.want)
        );
        for (const f of found) {
          const key = `${f.username}|${f.want}|${f.offer}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(`
            <div class="item">
              <strong>@${escapeHtml(f.username)}</strong> offers <em>${escapeHtml(f.offer)}</em>
              (and wants ${escapeHtml(f.want)})
              <button onclick="startMessage('${jsString(f.username)}')" style="margin-left:10px;">Open Chat</button>
            </div>
          `);
        }
      }

      box.innerHTML = rows.length ? rows.join('') : '<p>No matches found yet.</p>';
    } catch {
      box.innerHTML = '<p>Could not load matches.</p>';
    }
  }

  // ---------------------------------------------
  // MESSAGES PAGE
  // ---------------------------------------------
// ----- MESSAGES PAGE -----
const inboxList   = document.getElementById('inboxList');
const sendBtn     = document.getElementById('sendBtn');
const toUser      = document.getElementById('toUser');
const messageBody = document.getElementById('messageBody');

async function loadInbox() {
  const u = getUser();
  if (!u || !inboxList) return;
  try {
    const rows = await api('/messages?user_id=' + u.id);
    if (!rows || rows.length === 0) {
      inboxList.innerHTML = '<p>No messages yet.</p>';
      return;
    }
    inboxList.innerHTML = rows.map(m => `
      <div class="msg-row">
        <div class="msg-meta">
          <strong>From:</strong> @${escapeHtml(m.from_username)}
          &nbsp;→&nbsp;
          <strong>To:</strong> @${escapeHtml(m.to_username)}
          &nbsp;|&nbsp;
          <span>${escapeHtml(m.created_at)}</span>
        </div>
        <div class="msg-body">${escapeHtml(m.body)}</div>
      </div>
    `).join('');
  } catch (e) {
    inboxList.innerHTML = '<p>Could not load messages.</p>';
  }
}

if (inboxList) {
  const prefill = localStorage.getItem('composeTo');
  if (prefill && toUser) {
    toUser.value = prefill;
    localStorage.removeItem('composeTo');
  }
  await loadInbox();
}

if (sendBtn) {
  sendBtn.addEventListener('click', async () => {
    const u = getUser();
    if (!u) { window.location = 'login.html'; return; }
    const to = (toUser?.value || '').trim();
    const body = (messageBody?.value || '').trim();
    const status = document.getElementById('msg');
    if (!to || !body) { if (status) status.textContent = 'Please fill both fields.'; return; }
    if (body.length > 300) { if (status) status.textContent = 'Keep message under 300 characters.'; return; }

    try {
      await api('/messages', 'POST', { from_user_id: u.id, to_username: to, body });
      if (status) status.textContent = 'Sent!';
      messageBody.value = '';
      await loadInbox();
    } catch (e) {
      if (status) status.textContent = 'Send failed: ' + e.message;
    }
  });
}


  // ---------------------------------------------
  // Shared helpers inside DOMContentLoaded
  // ---------------------------------------------
  function escapeHtml(str = '') {
    return String(str).replace(
      /[&<>"']/g,
      (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  // Safely embed strings into onclick=''
  function jsString(str = '') {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}); // ✅ closes DOMContentLoaded

// ===============================================
// Globals (outside DOMContentLoaded)
// ===============================================

// -------- Delete (global) --------
async function deleteSkill(id) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  try {
    await api('/skills/' + id, 'DELETE');
    location.reload();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}
window.deleteSkill = deleteSkill;

// -------- Inline Edit helpers (global) --------
function startEdit(id, offer, want) {
  const form = document.getElementById('edit-form-' + id);
  const offerInput = document.getElementById('edit-offer-' + id);
  const wantInput  = document.getElementById('edit-want-' + id);
  if (offerInput) offerInput.value = offer;
  if (wantInput)  wantInput.value  = want;
  if (form) form.style.display = 'block';
}
function cancelEdit(id) {
  const form = document.getElementById('edit-form-' + id);
  if (form) form.style.display = 'none';
}
async function submitEdit(id) {
  const offerInput = document.getElementById('edit-offer-' + id);
  const wantInput  = document.getElementById('edit-want-' + id);
  const offer = (offerInput?.value || '').trim();
  const want  = (wantInput?.value  || '').trim();
  if (!offer || !want) { alert('Please fill both fields.'); return; }
  if (offer.length > 100 || want.length > 100) { alert('Keep each field under 100 characters.'); return; }
  try {
    await api('/skills/' + id, 'PUT', { offer, want });
    // soft refresh of lists
    if (typeof loadMySkills === 'function') await loadMySkills();
    if (typeof loadMatchesWantMyOffer === 'function') await loadMatchesWantMyOffer();
    if (typeof loadMatchesOfferMyWant === 'function') await loadMatchesOfferMyWant();
  } catch (err) {
    alert('Update failed: ' + err.message);
  } finally {
    cancelEdit(id);
  }
}
window.startEdit = startEdit;
window.cancelEdit = cancelEdit;
window.submitEdit = submitEdit;

// -------- Open Chat helper (global) --------
function startMessage(username) {
  try { localStorage.setItem('composeTo', username); } catch {}
  window.location = 'messages.html';
}
window.startMessage = startMessage;
