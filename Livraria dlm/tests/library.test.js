'use strict';

/**
 * Testes da lógica de biblioteca e publisher (api.js + publisher.html).
 * Cobre: addLicense, getMyLicenses, lookup por bookId, e fluxo de publish.
 */

// ── Mock de localStorage ──────────────────────────────────────────────────────

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem:    key       => store.has(key) ? store.get(key) : null,
    setItem:    (key, val) => store.set(key, val),
    removeItem: key       => store.delete(key),
    clear:      ()        => store.clear(),
  };
}

// ── Lógica extraída de api.js (APILicenses + APIBooks) ────────────────────────

function makeAPILicenses(ls) {
  const KEY = 'dlm_my_licenses';
  return {
    getMyLicenses() {
      const stored = ls.getItem(KEY);
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
        owner: 'test-addr',
      });
      ls.setItem(KEY, JSON.stringify(licenses));
    },
    removeLicense(licenseId) {
      const current = this.getMyLicenses();
      ls.setItem(KEY, JSON.stringify(current.filter(l => String(l.licenseId) !== String(licenseId))));
    },
  };
}

function makeAPIBooks(ls) {
  const KEY = 'dlm_books_catalog';
  let _seq = 1716000000000;
  return {
    getAll() {
      const stored = ls.getItem(KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    },
    getById(id) {
      return this.getAll().find(b => String(b.id) === String(id)) || null;
    },
    add(book) {
      const books = this.getAll();
      book.id = _seq++;
      books.unshift(book);
      ls.setItem(KEY, JSON.stringify(books));
      return book;
    },
    remove(id) {
      const books = this.getAll().filter(b => String(b.id) !== String(id));
      ls.setItem(KEY, JSON.stringify(books));
    },
  };
}

// ── Lógica do publishBook (extraída de publisher.html) ────────────────────────

async function runPublishBook({ registerUser, encrypt, apiBooks, apiLicenses, bookData }) {
  // Best-effort: não bloqueia se registerUser falhar
  try {
    await registerUser();
  } catch { /* continua */ }

  // Crítico: falha aqui bloqueia tudo
  const encResult = await encrypt();
  const licenseId = encResult.licenseId;

  const book = apiBooks.add(bookData);
  apiLicenses.addLicense(book.id, licenseId);
  return { book, licenseId };
}

// ── Testes: APILicenses ───────────────────────────────────────────────────────

describe('APILicenses.addLicense + getMyLicenses', () => {
  let ls, lib;

  beforeEach(() => {
    ls  = makeLocalStorage();
    lib = makeAPILicenses(ls);
  });

  test('getMyLicenses retorna array vazio quando não há licenças', () => {
    expect(lib.getMyLicenses()).toEqual([]);
  });

  test('addLicense armazena a licença corretamente', () => {
    lib.addLicense(1, '42');
    const licenses = lib.getMyLicenses();
    expect(licenses).toHaveLength(1);
    expect(licenses[0].licenseId).toBe('42');
    expect(licenses[0].bookId).toBe('1');
  });

  test('bookId é sempre armazenado como string (mesmo quando passado como number)', () => {
    lib.addLicense(9999, '7');
    expect(lib.getMyLicenses()[0].bookId).toBe('9999');
  });

  test('múltiplos addLicense acumulam sem sobrescrever', () => {
    lib.addLicense(1, '10');
    lib.addLicense(2, '20');
    lib.addLicense(3, '30');
    expect(lib.getMyLicenses()).toHaveLength(3);
  });

  test('hasLicense retorna true para bookId com licença', () => {
    lib.addLicense(5, '99');
    expect(lib.hasLicense(5)).toBe(true);
    expect(lib.hasLicense('5')).toBe(true);
  });

  test('hasLicense retorna false para bookId sem licença', () => {
    lib.addLicense(1, '99');
    expect(lib.hasLicense(99)).toBe(false);
  });

  test('removeLicense remove apenas a licença correta', () => {
    lib.addLicense(1, '10');
    lib.addLicense(2, '20');
    lib.removeLicense('10');
    const remaining = lib.getMyLicenses();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].licenseId).toBe('20');
  });

  test('removeLicense não afeta lista quando licenseId não existe', () => {
    lib.addLicense(1, '10');
    lib.removeLicense('999');
    expect(lib.getMyLicenses()).toHaveLength(1);
  });
});

// ── Testes: APIBooks.getById localiza livro recém-adicionado ─────────────────

describe('APIBooks.getById após addLicense (integração local)', () => {
  let ls, apiBooks, apiLicenses;

  beforeEach(() => {
    ls          = makeLocalStorage();
    apiBooks    = makeAPIBooks(ls);
    apiLicenses = makeAPILicenses(ls);
  });

  test('livro publicado aparece em getById após ser adicionado', () => {
    const book = apiBooks.add({ title: 'Novo Livro', author: 'Autor X', price: 30 });
    const found = apiBooks.getById(book.id);
    expect(found).not.toBeNull();
    expect(found.title).toBe('Novo Livro');
  });

  test('livro com licença é encontrado via bookId da licença', () => {
    const book = apiBooks.add({ title: 'Livro Licenciado', author: 'Autor Y', price: 15 });
    apiLicenses.addLicense(book.id, '555');

    const licenses = apiLicenses.getMyLicenses();
    expect(licenses).toHaveLength(1);

    const found = apiBooks.getById(licenses[0].bookId);
    expect(found).not.toBeNull();
    expect(found.title).toBe('Livro Licenciado');
  });

  test('sem livros publicados, getById retorna null para qualquer id', () => {
    expect(apiBooks.getById(1)).toBeNull();
    expect(apiBooks.getById(999)).toBeNull();
  });

  test('sem livros publicados, getAll retorna array vazio', () => {
    expect(apiBooks.getAll()).toEqual([]);
  });

  test('remove() exclui apenas o livro com o ID informado', () => {
    const b1 = apiBooks.add({ title: 'Livro A', author: 'A', price: 10 });
    const b2 = apiBooks.add({ title: 'Livro B', author: 'B', price: 20 });
    apiBooks.remove(b1.id);
    const remaining = apiBooks.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('Livro B');
  });

  test('livros com qualquer ID (inclusive pequenos) são preservados — sem filtro automático', () => {
    const KEY = 'dlm_books_catalog';
    const books = [
      { id: 1, title: 'Livro ID Pequeno', author: 'Autor A', price: 39.9 },
      { id: 2, title: 'Outro ID Pequeno', author: 'Autor B', price: 34.9 },
      { id: 1716000000000, title: 'Livro ID Timestamp', author: 'Autor C', price: 20 },
    ];
    ls.setItem(KEY, JSON.stringify(books));

    const result = apiBooks.getAll();
    expect(result).toHaveLength(3);
    expect(result.map(b => b.title)).toContain('Livro ID Pequeno');
    expect(result.map(b => b.title)).toContain('Livro ID Timestamp');
  });
});

// ── Testes: fluxo de publish (publisher.html) ─────────────────────────────────

describe('runPublishBook — addLicense sempre executado', () => {
  let ls, apiBooks, apiLicenses;

  beforeEach(() => {
    ls          = makeLocalStorage();
    apiBooks    = makeAPIBooks(ls);
    apiLicenses = makeAPILicenses(ls);
  });

  test('addLicense é chamado mesmo quando registerUser falha', async () => {
    const registerUser = jest.fn().mockRejectedValue(new Error('API fora'));
    const encrypt      = jest.fn().mockResolvedValue({ licenseId: '42' });

    const { book, licenseId } = await runPublishBook({
      registerUser, encrypt, apiBooks, apiLicenses,
      bookData: { title: 'Teste', author: 'Autor', price: 10 },
    });

    expect(licenseId).toBe('42');
    const licenses = apiLicenses.getMyLicenses();
    expect(licenses).toHaveLength(1);
    expect(licenses[0].bookId).toBe(String(book.id));
    expect(licenses[0].licenseId).toBe('42');
  });

  test('addLicense é chamado quando registerUser e encrypt ambos têm sucesso', async () => {
    const registerUser = jest.fn().mockResolvedValue({ ok: true });
    const encrypt      = jest.fn().mockResolvedValue({ licenseId: '99' });

    await runPublishBook({
      registerUser, encrypt, apiBooks, apiLicenses,
      bookData: { title: 'Livro OK', author: 'Autor', price: 25 },
    });

    expect(apiLicenses.getMyLicenses()).toHaveLength(1);
  });

  test('addLicense NÃO é chamado quando encrypt falha', async () => {
    const registerUser = jest.fn().mockResolvedValue({ ok: true });
    const encrypt      = jest.fn().mockRejectedValue(new Error('Encrypt falhou'));

    await expect(
      runPublishBook({ registerUser, encrypt, apiBooks, apiLicenses, bookData: {} })
    ).rejects.toThrow('Encrypt falhou');

    expect(apiLicenses.getMyLicenses()).toHaveLength(0);
  });

  test('livro publicado aparece na biblioteca após publish', async () => {
    const registerUser = jest.fn().mockRejectedValue(new Error('API fora'));
    const encrypt      = jest.fn().mockResolvedValue({ licenseId: '77' });

    const { book } = await runPublishBook({
      registerUser, encrypt, apiBooks, apiLicenses,
      bookData: { title: 'Meu Livro', author: 'Eu', price: 50 },
    });

    // Simula o que biblioteca.html faz ao listar licenças
    const licenses = apiLicenses.getMyLicenses();
    const found    = licenses.map(l => apiBooks.getById(l.bookId)).filter(Boolean);

    expect(found).toHaveLength(1);
    expect(found[0].title).toBe('Meu Livro');
    expect(found[0].id).toBe(book.id);
  });
});

// ── Lógica de carregamento blockchain-first (biblioteca.html) ─────────────────

/**
 * Simula loadLibrary(): tenta busca() na API; se falhar, usa localStorage.
 * Mescla dados da chain com metadados locais (emoji, color).
 */
async function runLoadLibrary({ buscaFn, apiBooks, apiLicenses }) {
  const COLORS = ['#1e3a5f','#78350f','#3b0764'];

  try {
    const result     = await buscaFn();
    const chainBooks = result.books || [];
    const localLics  = apiLicenses.getMyLicenses();

    return chainBooks.map(cb => {
      const localLic  = localLics.find(l => String(l.licenseId) === String(cb.licenseId));
      const localBook = localLic ? apiBooks.getById(localLic.bookId) : null;
      return {
        licenseId: String(cb.licenseId),
        title:     cb.title  || localBook?.title  || 'Sem título',
        author:    cb.author || localBook?.author || '',
        emoji:     localBook?.emoji || '📚',
        fromChain: true,
      };
    });
  } catch {
    // Fallback: localStorage
    const localLics = apiLicenses.getMyLicenses();
    return localLics.map(lic => {
      const book = apiBooks.getById(lic.bookId);
      if (!book) return null;
      return { licenseId: String(lic.licenseId), title: book.title, author: book.author, emoji: book.emoji || '📚', fromChain: false };
    }).filter(Boolean);
  }
}

describe('loadLibrary — blockchain-first com fallback localStorage', () => {
  let ls, apiBooks, apiLicenses;

  beforeEach(() => {
    ls          = makeLocalStorage();
    apiBooks    = makeAPIBooks(ls);
    apiLicenses = makeAPILicenses(ls);
  });

  test('retorna livros da chain quando busca() resolve', async () => {
    const buscaFn = jest.fn().mockResolvedValue({
      books: [
        { licenseId: 'abc', title: 'Livro Chain', author: 'Autor Chain' },
      ],
    });

    const result = await runLoadLibrary({ buscaFn, apiBooks, apiLicenses });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Livro Chain');
    expect(result[0].fromChain).toBe(true);
  });

  test('mescla metadados locais (emoji) com dados da chain', async () => {
    const book = apiBooks.add({ title: 'Livro Local', author: 'Autor', emoji: '🔥', price: 10 });
    apiLicenses.addLicense(book.id, 'xyz');

    const buscaFn = jest.fn().mockResolvedValue({
      books: [{ licenseId: 'xyz', title: 'Livro Local', author: 'Autor' }],
    });

    const result = await runLoadLibrary({ buscaFn, apiBooks, apiLicenses });
    expect(result[0].emoji).toBe('🔥');
  });

  test('livro transferido some da lista quando chain retorna vazio', async () => {
    const buscaFn = jest.fn().mockResolvedValue({ books: [] });
    const result  = await runLoadLibrary({ buscaFn, apiBooks, apiLicenses });
    expect(result).toHaveLength(0);
  });

  test('usa localStorage como fallback quando busca() falha', async () => {
    const book = apiBooks.add({ title: 'Fallback Livro', author: 'Autor', price: 5 });
    apiLicenses.addLicense(book.id, '999');

    const buscaFn = jest.fn().mockRejectedValue(new Error('API fora'));
    const result  = await runLoadLibrary({ buscaFn, apiBooks, apiLicenses });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Fallback Livro');
    expect(result[0].fromChain).toBe(false);
  });

  test('fallback retorna vazio quando localStorage e chain estão vazios', async () => {
    const buscaFn = jest.fn().mockRejectedValue(new Error('API fora'));
    const result  = await runLoadLibrary({ buscaFn, apiBooks, apiLicenses });
    expect(result).toHaveLength(0);
  });

  test('catálogo sem livros publicados retorna array vazio', () => {
    expect(apiBooks.getAll()).toEqual([]);
  });
});
