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

A URL da API blockchain/licenças é configurada em `js/api.js`:
```js
const API_BASE = window.DLM_API_BASE || 'https://dlm-pdf-server-production.up.railway.app/api/v1';
```

A URL da DRM API (criptografia centralizada) é configurada separadamente:
```js
const DRM_API_BASE = window.DLM_DRM_API_BASE || 'https://dlm-pdf-server-production.up.railway.app/api/v1';
```

Para trocar os servidores em produção:
```html
<script>
  window.DLM_API_BASE     = 'https://sua-api.com/api/v1';
  window.DLM_DRM_API_BASE = 'https://sua-drm-api.com/api/v1';
</script>
<script src="js/api.js"></script>
```

### Métodos DRM disponíveis via `window.DLM.APIDLM`

| Método | Descrição |
|--------|-----------|
| `APIDLM.registerUser(address, name, cpf)` | Cadastra usuário |
| `APIDLM.lookupUser(address)` | Consulta nome+CPF por endereço |
| `APIDLM.encrypt(pdfBase64, publicKey, userName, userCPF, licenseId?)` | Encripta PDF → .dlm v3 |
| `APIDLM.decrypt(dlmBase64, publicKey, signature, message)` | Decifra com cadeia de custódia |
| `APIDLM.previewTransfer(toPublicKey, licenseId)` | Consulta destinatário |
| `APIDLM.transfer(fromKey, toKey, licenseId, sig, msg)` | Executa transferência |

O servidor (`server.js`) também expõe rotas proxy em `/api/drm/*` para operações que precisam
combinar DRM + blockchain (ex.: transferência que atualiza DRM + NFT on-chain).

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

**Regra de segurança: após qualquer alteração no projeto, o agente de segurança é responsável por verificar todo o sistema antes do commit.**

1. **`/security-review`** — verificar JWT, armazenamento de chaves AES, validação on-chain, rotas proxy DRM
2. **`/review`** — coerência entre frontend, servidor, DRM API e contrato
3. Checklist:
   - [ ] `.env` não aparece no `git status`
   - [ ] `storage/` não aparece no `git status`
   - [ ] `js/api.js` aponta para as URLs corretas (API_BASE e DRM_API_BASE)
   - [ ] Rotas proxy `/api/drm/*` respondem corretamente
   - [ ] DRM API (`DRM_API_URL`) está acessível pelo servidor
   - [ ] Contrato compila sem warnings (`npx hardhat compile`)
4. Commit e push — o hook de post-commit empurra automaticamente

## Regra de Commit

**Sempre que houver qualquer alteração no projeto, realizar o commit imediatamente após a mudança.**
Não acumular alterações sem commitar. Cada conjunto de mudanças relacionadas deve ter seu próprio commit descritivo antes de continuar.

## Features Planejadas (não implementar sem ordem explícita)

### Sistema de Transferência de Posse com Identificação por Nome

1. **Cadastro de nome no login** — ao entrar com MetaMask em `pages/auth.html`, solicitar nome completo do usuário. Salvar via `registerUser(username)` no contrato ou em banco local vinculado ao endereço. Sem nome cadastrado não pode transferir.

2. **Biblioteca lista livros da carteira** — `pages/biblioteca.html` deve buscar todos os tokens ERC-721 do endereço conectado via `contract.userTokens(address)` e exibir com título, capa e opções (Ler / Transferir / Vender).

3. **Transferência exige nome do destinatário visível** — ao iniciar transferência, o remetente informa o endereço Ethereum do destinatário; o sistema busca e exibe o **nome completo cadastrado** desse endereço para confirmação. Sem nome cadastrado do destinatário, a transferência é bloqueada.

4. **Re-encriptação na transferência** — o servidor gera novo `.dlm` com `ownerAddress` do destinatário (nova chave HKDF). O `.dlm` antigo é invalidado. O novo arquivo é baixado automaticamente para ser entregue ao destinatário fora da plataforma (e-mail, mensagem).

5. **Transferência do NFT na blockchain** — após a re-encriptação, acionar `transferToUser(tokenId, newOwnerAddress)` no contrato para transferir o NFT. As duas ações (re-encriptar + transferir NFT) devem ser atômicas ou com rollback claro se uma falhar.

6. **DLM-PDF Platform verifica cadeia** — se `ownerAddress` do `.dlm` não bate com a carteira atual, o sistema consulta o servidor/blockchain: se há transferência registrada, oferece re-encriptar para o novo dono; caso contrário, nega acesso.

**Arquivos a modificar**:
- `pages/auth.html` — adicionar campo de nome no cadastro
- `pages/biblioteca.html` — listar tokens do contrato, botão Transferir com modal de nome
- `server.js` — rota `POST /api/reencrypt` (valida assinatura do dono atual, re-encripta para novo dono)
- `server.js` — rota `GET /api/users/:address` (retorna nome pelo endereço)
- `DLMBookstore.sol` — `getUserByAddress(address)` retornando UserProfile
- `DLM-PDF Platform / js/reader.js` — verificação de cadeia de custódia ao abrir .dlm
