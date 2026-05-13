/**
 * js/app.js
 * Responsabilidade: utilitários globais compartilhados por todas as páginas.
 */

'use strict';

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', dur = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { ok: '✅', err: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ── Delay ─────────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Formata preço ─────────────────────────────────────────────────────────────
function formatPrice(val) {
  return 'R$ ' + Number(val).toFixed(2).replace('.', ',');
}

// ── Capa do livro ─────────────────────────────────────────────────────────────
function bookCoverHTML(book, size = 'full') {
  const colors = ['#1e3a5f','#78350f','#3b0764','#1c1917','#7c3aed','#15803d','#9d174d','#0f4c81'];
  const color = book.color || colors[book.id % colors.length] || '#1e3a5f';
  return `
    <div class="book-cover-placeholder" style="background:${color}">
      <div class="book-emoji">${book.emoji || '📚'}</div>
      <div class="book-initials" style="color:rgba(255,255,255,.7)">${book.title}</div>
    </div>`;
}

// ── Navbar: estado do usuário ─────────────────────────────────────────────────
function initNavbar() {
  const walletEl = document.getElementById('nav-wallet');
  const loginBtn = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');

  if (!window.DLM) return;

  const { Auth } = window.DLM;

  if (Auth.isLoggedIn()) {
    const addr = Auth.getAddress() || '';
    if (walletEl) {
      walletEl.textContent = addr.slice(0, 8) + '...' + addr.slice(-4);
      walletEl.classList.add('show');
    }
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else {
    if (walletEl)  walletEl.classList.remove('show');
    if (loginBtn)  loginBtn.style.display  = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Auth.clear();
      window.location.href = '/index.html';
    });
  }
}

// ── Marca link ativo na navbar ────────────────────────────────────────────────
function markActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', path.endsWith(a.getAttribute('href')));
  });
}

// ── Init global ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  markActiveNav();
});

window.toast     = toast;
window.delay     = delay;
window.formatPrice = formatPrice;
window.bookCoverHTML = bookCoverHTML;
