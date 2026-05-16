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
    return [];
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
      return {
        granted: true,
        licenseId,
        txHash: '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        sessionKey: null,
        expiresAt: Date.now() + 3600000,
      };
    }
  },

  /**
   * Envia o arquivo .dlm para o servidor, que verifica posse on-chain,
   * descriptografa e retorna o PDF em base64.
   * @param {string} licenseId
   * @param {string|null} dlmBase64 - conteúdo do .dlm em base64 (ou null para usar PDF armazenado)
   * @returns {{ pdfBase64: string, licenseId: string, ownerAddress: string }}
   */
  async readBook(licenseId, dlmBase64 = null) {
    return apiFetch(`/licenses/${licenseId}/read`, {
      method: 'POST',
      body: JSON.stringify({ dlmBase64 }),
    });
  },

  /**
   * Re-encripta o arquivo .dlm para um novo dono.
   * Deve ser chamado antes da transferência on-chain do NFT.
   * @param {string} licenseId
   * @param {string} dlmBase64 - arquivo .dlm atual em base64
   * @param {string} newOwnerAddress - endereço Ethereum do novo dono
   * @returns {{ dlmBase64: string, licenseId: string, newOwnerAddress: string, version: number }}
   */
  async reencryptBook(licenseId, dlmBase64, newOwnerAddress) {
    return apiFetch(`/licenses/${licenseId}/reencrypt`, {
      method: 'POST',
      body: JSON.stringify({ dlmBase64, newOwnerAddress }),
    });
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

  async encryptPDF(pdfBase64, licenseId, ownerAddress) {
    return apiFetch('/publisher/encrypt', {
      method: 'POST',
      body: JSON.stringify({ pdfBase64, licenseId, ownerAddress }),
    });
  },

  async uploadPDF(bookId, pdfBase64) {
    return apiFetch(`/publisher/books/${bookId}/upload`, {
      method: 'POST',
      body: JSON.stringify({ pdfBase64 }),
    });
  },
};

// ══════════════════════════════════════════════════════════════
//  DRM API — métodos de criptografia centralizados (DLM PDF API)
//  A URL da DRM API é configurada separadamente de API_BASE.
//  Esses métodos NÃO dependem de JWT — usam publicKey + assinatura MetaMask.
// ══════════════════════════════════════════════════════════════
const DRM_API_BASE = window.DLM_DRM_API_BASE || 'https://dlm-pdf-server-production.up.railway.app/api/v1';

async function drmFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(DRM_API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
  return data;
}

const APIDLM = {
  /**
   * Registra usuário (endereço → nome + CPF) na DRM API.
   */
  async registerUser(address, name, cpf) {
    return drmFetch('/users/register', {
      method: 'POST',
      body: JSON.stringify({ address, name, cpf }),
    });
  },

  /**
   * Consulta nome e CPF de um endereço Ethereum.
   */
  async lookupUser(address) {
    return drmFetch(`/users/${encodeURIComponent(address)}`);
  },

  /**
   * Encripta um PDF e registra a titularidade.
   * @param {string} pdfBase64
   * @param {string} publicKey    — endereço Ethereum do titular
   * @param {string} userName
   * @param {string} userCPF
   * @param {string} [licenseId] — gerado automaticamente se omitido
   * @param {string} [title]     — título do livro (embutido no .dlm)
   * @param {string} [author]    — autor do livro (embutido no .dlm)
   * @returns {{ dlmBase64, licenseId, contentHash, owner, metadata }}
   */
  async encrypt(pdfBase64, publicKey, userName, userCPF, licenseId = null, title = null, author = null) {
    return drmFetch('/encrypt', {
      method: 'POST',
      body: JSON.stringify({ pdfBase64, publicKey, userName, userCPF, licenseId, title, author }),
    });
  },

  /**
   * Descriptografa um .dlm v3 usando cadeia de custódia.
   * Requer assinatura MetaMask para provar posse da carteira.
   *
   * Como gerar a assinatura no frontend (MetaMask):
   *   const message = `DLM:decrypt:${licenseId}:${Date.now()}`;
   *   const signature = await ethereum.request({
   *     method: 'personal_sign',
   *     params: [message, publicKey],
   *   });
   *
   * @param {string} dlmBase64
   * @param {string} publicKey   — endereço Ethereum do dono atual
   * @param {string} signature   — assinatura MetaMask
   * @param {string} message     — mensagem assinada (termina em ":millis")
   * @returns {{ pdfBase64, dlmBase64 (atualizado), licenseId, owner }}
   */
  async decrypt(dlmBase64, publicKey, signature, message) {
    return drmFetch('/decrypt', {
      method: 'POST',
      body: JSON.stringify({ dlmBase64, publicKey, signature, message }),
    });
  },

  /**
   * Consulta nome e CPF do destinatário antes da transferência.
   * @returns {{ newOwner: { address, name, cpf }, currentOwner, licenseId }}
   */
  async previewTransfer(toPublicKey, licenseId) {
    return drmFetch('/transfer/preview', {
      method: 'POST',
      body: JSON.stringify({ toPublicKey, licenseId }),
    });
  },

  /**
   * Executa transferência de posse. Requer assinatura MetaMask do cedente.
   *
   * Como gerar a assinatura:
   *   const message = `DLM:transfer:${licenseId}:${Date.now()}`;
   *   const signature = await ethereum.request({
   *     method: 'personal_sign',
   *     params: [message, fromPublicKey],
   *   });
   *
   * @returns {{ licenseId, previousOwner, newOwner, transferredAt }}
   */
  async transfer(fromPublicKey, toPublicKey, licenseId, signature, message) {
    return drmFetch('/transfer', {
      method: 'POST',
      body: JSON.stringify({ fromPublicKey, toPublicKey, licenseId, signature, message }),
    });
  },

  /**
   * Busca todos os livros registrados para uma chave pública na DRM API.
   * Usado para listar os livros que o usuário possui antes de uma transferência.
   * @param {string} publicKey — endereço Ethereum do titular
   * @returns {{ publicKey, books: Array<{ title, author, licenseId }> }}
   */
  async busca(publicKey) {
    return drmFetch(`/busca?publicKey=${encodeURIComponent(publicKey)}`);
  },
};

// ── Exporta para uso global ───────────────────────────────────────────────────
window.DLM = { Auth, APIAuth, APIBooks, APILicenses, APIPublisher, APIDLM };
