# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Instala dependências do servidor (Express, ethers, etc.)
npm start            # Sobe o servidor em produção (porta 3001)
npm run dev          # Sobe com nodemon (hot-reload)
npx serve ./ -p 3002 # Serve o frontend estático
```

### Smart Contract (Hardhat — na raiz do projeto ou separado)
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
npx hardhat compile
npx hardhat run deploy.js --network sepolia
```

### Ambiente
```bash
cp .env.example .env
# Preencher: RPC_URL, ADMIN_PRIVATE_KEY, CONTRACT_ADDRESS, DLM_API_KEY, JWT_SECRET
```

## Arquitetura

```
Browser (index.html + pages/)
    ↕ fetch / localStorage (modo demo)
js/api.js  →  DLM PDF API  (http://localhost:3000/api/v1)
               ↕ ethers.js
           Smart Contract DLMBookstore.sol (ERC-721, Sepolia / local)
```

O frontend é **HTML + Vanilla JS puro** (sem bundler). Cada página fica em `pages/` e é carregada como arquivo separado. O arquivo `js/api.js` é o único ponto de integração com a API.

### Frontend (`index.html` + `pages/`)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `index.html` | Shell principal, navbar e roteamento |
| `pages/catalog.html` | Catálogo de livros disponíveis |
| `pages/livro.html` | Página do livro + leitor DRM |
| `pages/biblioteca.html` | Biblioteca do usuário autenticado |
| `pages/publisher.html` | Painel do publisher (cadastro de livros) |
| `pages/auth.html` | Login/cadastro via MetaMask |
| `css/style.css` | Design system completo |
| `js/api.js` | Cliente da API — **único lugar para trocar a URL do servidor** |
| `js/app.js` | Utilitários globais (toast, delay, formatação) |

### Modo demo (sem blockchain)
`js/api.js` usa `localStorage` como fallback quando a API não responde:
- Catálogo: `dlm_books_catalog` no localStorage (6 livros padrão)
- Licenças: `dlm_my_licenses` no localStorage
- Sessão: `dlm_token` e `dlm_address` no localStorage

### Smart Contract (`DLMBookstore.sol`)
ERC-721 Ownable. Cada cópia de livro é um NFT transferível. Funções principais:
- `registerUser(username)` — cadastra carteira com username
- `addBook(...)` — publisher registra livro (somente admin)
- `purchaseBook(bookId)` — compra livro, minta NFT para o comprador
- `listForResale(tokenId, price)` / `buyResaleBook(tokenId)` — marketplace P2P
- `transferToUser(tokenId, toWallet)` / `transferToUsername(tokenId, username)` — transferência

### Servidor legado (`server.js`)
Backend autônomo Node.js com DRM próprio (AES-256-CBC, armazenamento em `storage/`).
Usado para desenvolvimento sem depender do DLM PDF API. **Não commitar `.env` nem `storage/`**.

## Integração com DLM PDF API

A URL da API é configurada em `js/api.js`:
```js
const API_BASE = window.DLM_API_BASE || 'http://localhost:3000/api/v1';
```

Para trocar o servidor em produção, defina `window.DLM_API_BASE` antes de carregar `api.js`:
```html
<script>window.DLM_API_BASE = 'https://sua-api.com/api/v1';</script>
<script src="js/api.js"></script>
```

## GitHub & Auto-Sync

**Repositório:** `https://github.com/matheusmerlim1/trabalho-nilson`

Todo `git commit` dispara push automático via hook `.git/hooks/post-commit`.
Claude Code também sincroniza ao encerrar a sessão via hook `Stop` em `.claude/settings.json`.

**Não commitar:** `.env`, `storage/keys/`, `storage/encrypted/`, `.claude/settings.local.json`

## Claude Code Skills

| Skill | Quando usar |
|-------|------------|
| `/security-review` | Antes de qualquer PR tocando auth, crypto ou contrato |
| `/review` | Revisão geral de código |
| `/init` | Regenerar este CLAUDE.md se a arquitetura mudar |
| `/update-config` | Alterar hooks ou permissões |

### Revisão obrigatória ao final de cada sessão

1. **`/security-review`** — verificar JWT, armazenamento de chaves AES, validação on-chain
2. **`/review`** — coerência entre frontend, servidor e contrato
3. Checklist:
   - [ ] `.env` não aparece no `git status`
   - [ ] `storage/` não aparece no `git status`
   - [ ] `js/api.js` aponta para a URL correta
   - [ ] Contrato compila sem warnings (`npx hardhat compile`)
4. Commit e push — o hook de post-commit empurra automaticamente

## Regra de Commit

**Sempre que houver qualquer alteração no projeto, realizar o commit imediatamente após a mudança.**
Não acumular alterações sem commitar. Cada conjunto de mudanças relacionadas deve ter seu próprio commit descritivo antes de continuar.
