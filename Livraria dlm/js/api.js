/**
 * js/api.js
 * Responsabilidade: todas as chamadas à API do servidor DLM-PDF.
 * Troque API_BASE pela URL do Railway quando estiver em produção.
 */

'use strict';

// ── Configuração ──────────────────────────────────────────────────────────────
const API_BASE = window.DLM_API_BASE || 'https://dlm-pdf-server-production.up.railway.app/api/v1';

// ── Autenticação local ────────────────────────────────────────────────────────
const Auth = {
  getToken()   { return localStorage.getItem('dlm_token'); },
  getAddress() { return localStorage.getItem('dlm_address'); },
  isLoggedIn() { return !!this.getToken(); },

  save(token, address) {
    localStorage.setItem('dlm_token', token);
    localStorage.setItem('dlm_address', address);
  },

  clear() {
    localStorage.removeItem('dlm_token');
    localStorage.removeItem('dlm_address');
  },
};

// ── Fetch com autenticação ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401) {
    Auth.clear();
    window.location.href = '/pages/auth.html';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
  return data;
}

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════
const APIAuth = {
  async getChallenge(address) {
    return apiFetch(`/auth/challenge?address=${encodeURIComponent(address)}`);
  },

  async login(address, message, signature) {
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ address, message, signature }),
    });
  },

  async health() {
    return fetch(API_BASE + '/health').then(r => r.json());
  },
};

// ══════════════════════════════════════════════════════════════
//  LIVROS (metadados públicos — sem auth)
// ══════════════════════════════════════════════════════════════
const APIBooks = {
  // Livros ficam em localStorage no modo demo (sem blockchain real)
  _storageKey: 'dlm_books_catalog',

  getAll() {
    const stored = localStorage.getItem(this._storageKey);
    return stored ? JSON.parse(stored) : this._defaultBooks();
  },

  getById(id) {
    return this.getAll().find(b => String(b.id) === String(id)) || null;
  },

  save(books) {
    localStorage.setItem(this._storageKey, JSON.stringify(books));
  },

  add(book) {
    const books = this.getAll();
    book.id = Date.now();
    book.createdAt = new Date().toISOString();
    books.unshift(book);
    this.save(books);
    return book;
  },

  _defaultBooks() {
    return [
      {
        id: 1, title: 'O Senhor dos Anéis', author: 'J.R.R. Tolkien',
        description: 'A épica jornada de Frodo e a Irmandade do Anel para destruir o Um Anel.',
        price: 39.90, genre: 'Fantasia', pages: 1178, year: 1954,
        emoji: '💍', color: '#1e3a5f', available: true, licenseId: 1,
      },
      {
        id: 2, title: 'Duna', author: 'Frank Herbert',
        description: 'Em um planeta desértico, Paul Atreides descobre seu destino como líder.',
        price: 34.90, genre: 'Ficção Científica', pages: 896, year: 1965,
        emoji: '🏜️', color: '#78350f', available: true, licenseId: 2,
      },
      {
        id: 3, title: 'Dom Casmurro', author: 'Machado de Assis',
        description: 'Bentinho narra sua história de amor com Capitu e a dúvida que o consome.',
        price: 19.90, genre: 'Literatura Brasileira', pages: 256, year: 1899,
        emoji: '📖', color: '#3b0764', available: true, licenseId: 3,
      },
      {
        id: 4, title: '1984', author: 'George Orwell',
        description: 'Winston Smith vive em um estado totalitário onde o Grande Irmão tudo controla.',
        price: 29.90, genre: 'Distopia', pages: 328, year: 1949,
        emoji: '👁️', color: '#1c1917', available: true, licenseId: 4,
      },
      {
        id: 5, title: 'O Pequeno Príncipe', author: 'Antoine de Saint-Exupéry',
        description: 'Um príncipe vindo de um asteroide encontra um aviador no deserto.',
        price: 24.90, genre: 'Clássico', pages: 96, year: 1943,
        emoji: '⭐', color: '#7c3aed', available: true, licenseId: 5,
      },
      {
        id: 6, title: 'A Revolução dos Bichos', author: 'George Orwell',
        description: 'Animais de uma fazenda se rebelam contra os humanos em uma alegoria política.',
        price: 22.90, genre: 'Sátira', pages: 144, year: 1945,
        emoji: '🐷', color: '#15803d', available: true, licenseId: 6,
      },
    ];
  },
};

// ══════════════════════════════════════════════════════════════
//  LICENÇAS (requer auth)
// ══════════════════════════════════════════════════════════════
const APILicenses = {
  _storageKey: 'dlm_my_licenses',

  getMyLicenses() {
    const stored = localStorage.getItem(this._storageKey);
    return stored ? JSON.parse(stored) : [];
  },

  hasLicense(bookId) {
    return this.getMyLicenses().some(l => String(l.bookId) === String(bookId));
  },

  addLicense(bookId, licenseId) {
    const licenses = this.getMyLicenses();
    licenses.push({
      licenseId,
      bookId: String(bookId),
      purchasedAt: new Date().toISOString(),
      owner: Auth.getAddress(),
    });
    localStorage.setItem(this._storageKey, JSON.stringify(licenses));
  },

  // Em produção usa a API real:
  async fetchFromChain() {
    try {
      return await apiFetch('/licenses/mine');
    } catch {
      return { licenses: this.getMyLicenses() };
    }
  },

  async openBook(licenseId) {
    try {
      return await apiFetch(`/licenses/${licenseId}/open`, { method: 'POST' });
    } catch {
      // modo demo: simula acesso
      return {
        granted: true,
        licenseId,
        txHash: '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        sessionKey: Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        expiresAt: Date.now() + 3600000,
      };
    }
  },
};

// ══════════════════════════════════════════════════════════════
//  PUBLISHER (requer auth)
// ══════════════════════════════════════════════════════════════
const APIPublisher = {
  async registerBook(title, author, contentHash, royaltyBps = 500) {
    try {
      return await apiFetch('/publisher/books', {
        method: 'POST',
        body: JSON.stringify({ title, author, contentHash, royaltyBps }),
      });
    } catch {
      return { txHash: '0x' + 'demo'.repeat(16), bookId: Date.now() };
    }
  },

  async mintLicense(bookId, buyerAddress) {
    try {
      return await apiFetch(`/publisher/books/${bookId}/mint`, {
        method: 'POST',
        body: JSON.stringify({ buyerAddress }),
      });
    } catch {
      return { licenseId: String(Math.floor(Math.random() * 9000) + 1000), txHash: '0x' + 'mint'.repeat(16) };
    }
  },

  async encryptPDF(pdfBase64, licenseId) {
    try {
      return await apiFetch('/publisher/encrypt', {
        method: 'POST',
        body: JSON.stringify({ pdfBase64, licenseId }),
      });
    } catch {
      // modo demo: retorna dados simulados
      return {
        dlmBase64: btoa('DLM\x01' + licenseId + '_encrypted_content_demo'),
        contentHash: '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        licenseId,
      };
    }
  },
};

// ── Exporta para uso global ───────────────────────────────────────────────────
window.DLM = { Auth, APIAuth, APIBooks, APILicenses, APIPublisher };
