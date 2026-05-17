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

## Arquitetura dos 3 Projetos

```
┌─────────────────────────────────────────────────────────────────┐
│  DLM PDF API  (trabalho de Nilson segurança/DLM PDF API)        │
│  GitHub: matheusmerlim1/DLM-PDF-API                             │
│  Papel: API REST + smart contract. Todos os métodos de          │
│         criptografia, licenças e custódia blockchain.           │
│  Site: documentação e demo do servidor                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP (APIDLM.*)
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────────┐   ┌──────────────────────────────────────┐
│   Livraria DLM      │   │   DLM-PDF Encriptador                │
│   (este projeto)    │   │   (DML-PDF plataform)                │
│   GitHub: trabalho- │   │   GitHub: matheusmerlim1/            │
│   nilson            │   │          DLM-PDF-encriptador         │
│                     │   │   GitHub Pages: encriptador          │
│   Papel: loja de    │   │                                      │
│   e-books. Editora  │   │   Papel: APENAS descriptografar      │
│   criptografa PDFs  │   │   arquivos .dlm. Leitor puro —       │
│   via APIDLM.       │   │   sem geração de .dlm.               │
│   encrypt(). Leitor │   │                                      │
│   transfere posse   │   │   Requer MetaMask (sem demo mode).   │
│   via APIDLM.       │   │   Chama POST /decrypt na API.        │
│   transfer().       │   └──────────────────────────────────────┘
└─────────────────────┘
```

### Regra de ouro entre os projetos
- **Toda lógica de criptografia** fica exclusivamente na DLM PDF API
- **Livraria DLM** e **DLM-PDF Encriptador** apenas consomem os métodos da API via `APIDLM.*`
- Nunca implementar crypto, geração de chaves ou parsing de `.dlm` nos projetos clientes

## Arquitetura interna da Livraria DLM

```
Browser (index.html + pages/)
    ↕ fetch / localStorage (modo demo)
js/api.js  →  DLM PDF API  (https://dlm-pdf-server-production.up.railway.app/api/v1)
               ↕ ethers.js
           Smart Contract DLMBookstore.sol (ERC-721, Sepolia / local)
```

O frontend é **HTML + Vanilla JS puro** (sem bundler). Cada página fica em `pages/` e é carregada como arquivo separado. O arquivo `js/api.js` é o único ponto de integração com a API.

### Frontend (`index.html` + `pages/`)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `index.html` | SPA principal — abas Minha Biblioteca / Transferir / Adicionar Livro |
| `pages/biblioteca.html` | Biblioteca do usuário — lista livros da blockchain + leitor DLM integrado |
| `pages/publisher.html` | Painel do publisher (upload PDF → encrypt → download .dlm) |
| `pages/auth.html` | Login/cadastro via MetaMask + modal de cadastro DRM (nome+CPF) |
| `pages/catalog.html` | Catálogo geral (legado — mantido mas não é o foco atual) |
| `pages/livro.html` | Página de detalhe do livro (legado) |
| `css/style.css` | Design system completo |
| `js/api.js` | Cliente da API — **único lugar para trocar a URL do servidor** |
| `js/app.js` | Utilitários globais (toast, delay, formatação) |

### Leitor DLM integrado (`pages/biblioteca.html`)
O botão **📖 Ler** na biblioteca abre o PDF diretamente na página:
1. Usuário seleciona o arquivo `.dlm` (seletor de arquivo nativo)
2. MetaMask assina a mensagem `DLM:decrypt:{licenseId}:{timestamp}`
3. `APIDLM.decrypt()` valida posse na API (cadeia de custódia) e retorna `pdfBase64`
4. PDF.js renderiza o PDF em canvas em overlay fullscreen
- Depende de MetaMask — sem MetaMask o botão mostra aviso
- PDF.js CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`

### Modo demo / fallback (sem blockchain)
`js/api.js` usa `localStorage` como fallback quando a API não responde:
- Catálogo: `dlm_books_catalog` no localStorage (vazio por padrão)
- Licenças: `dlm_my_licenses` no localStorage
- Sessão: `dlm_token` e `dlm_address` no localStorage
- `biblioteca.html` e `index.html`: busca blockchain-first via `APIDLM.busca()`; resultados positivos são cacheados em `dlm_busca_cache_{wallet}`; Railway reinicia → usa cache como fallback (não depende de exceção)
- `dlm_address` é salvo no login (`dlmAuth` no `index.html` e `Auth.save()` em `api.js`) para que `Auth.getAddress()` funcione em todas as páginas

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

| Método | Rota no servidor | Descrição |
|--------|-----------------|-----------|
| `APIDLM.registerUser(address, name, cpf)` | `POST /users/register` | Cadastra usuário |
| `APIDLM.lookupUser(address)` | `GET /users/:address` | Consulta nome+CPF por endereço |
| `APIDLM.encrypt(pdfBase64, publicKey, userName, userCPF, licenseId?, title?, author?)` | `POST /encrypt` | Encripta PDF → .dlm v3 (title e author são embutidos no arquivo se fornecidos) |
| `APIDLM.decrypt(dlmBase64, publicKey, signature, message)` | `POST /decrypt` | Decifra com cadeia de custódia |
| `APIDLM.busca(publicKey)` | `GET /busca?publicKey=` | Lista todos os livros (licenseId, title, author) cujo currentOwner é publicKey |
| `APIDLM.previewTransfer(toPublicKey, licenseId)` | `POST /transfer/preview` | Consulta destinatário |
| `APIDLM.transfer(fromKey, toKey, licenseId, sig, msg)` | `POST /transfer` | Executa transferência |

Endpoint extra (consulta pública de posse):
- `GET /licenses/public/:id` — retorna `{ licenseId, currentOwner: { address }, transferCount, createdAt }`

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

**Regra de erros: sempre que um erro for encontrado e corrigido, um teste automatizado ou cenário de teste referente a ele deve ser criado imediatamente. Não corrigir sem testar.**

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

## Regra de Versão dos Arquivos

**Antes de qualquer alteração ou commit, verificar se todos os arquivos estão usando as versões mais recentes:**

### Verificação obrigatória de versões

| Item | Versão atual | O que checar |
|------|-------------|--------------|
| Formato `.dlm` | **v3** | Nenhum arquivo deve gerar v1 ou v2; `APIDLM.encrypt` é a única rota de encriptação |
| `js/api.js` | **?v=6** (cache-busting) | Todas as páginas HTML devem carregar com `<script src="../js/api.js?v=6">` |
| `js/app.js` | **?v=6** (cache-busting) | Idem — `<script src="../js/app.js?v=6">` |
| `css/style.css` | **?v=6** (cache-busting) | `<link rel="stylesheet" href="../css/style.css?v=6">` |
| Endpoint de encriptação | **`APIDLM.encrypt`** | Nenhum código deve chamar rotas `/encrypt` legadas (v1/v2) diretamente |

### Como verificar

```bash
# Checar se alguma página ainda usa scripts sem cache-busting
grep -rn "api.js\"" pages/ index.html
grep -rn "app.js\"" pages/ index.html
grep -rn "style.css\"" pages/ index.html

# Checar se ainda existe chamada a rotas v1/v2 legadas
grep -rn "/encrypt" js/api.js
grep -rn "dlm-v1\|dlm-v2\|version.*1\|version.*2" js/

# Checar se publisher.html usa APIDLM.encrypt (e não rota direta)
grep -n "APIDLM.encrypt\|/publisher/encrypt\|/encrypt" pages/publisher.html

# Checar se biblioteca.html usa o fluxo correto (busca → previewTransfer → transfer)
grep -n "APIDLM.busca\|APIDLM.previewTransfer\|APIDLM.transfer" pages/biblioteca.html
```

**Regra:** ao incrementar qualquer versão de script ou formato, atualizar o sufixo `?v=N` em **todos** os arquivos HTML do projeto de uma vez. Nunca deixar páginas com versões diferentes entre si.

## Regra de Testes

**Antes de qualquer commit, todos os testes dos 3 projetos devem passar.**

### Comandos para rodar os testes

```bash
# Livraria DLM (este projeto)
cd "trabalho de Nilson segurança/Livraria dlm"
npm test

# DML-PDF Plataform
cd "DML-PDF plataform"
npm test

# DLM PDF API (servidor)
cd "trabalho de Nilson segurança/DLM PDF API/server"
npm test
```

### Regra obrigatória de correção

**Se qualquer teste falhar e uma correção for feita:**
1. Todos os testes dos **3 projetos** devem ser reexecutados do zero.
2. O commit só pode ser realizado se **100% dos testes passarem** em todos os projetos.
3. Nunca commitar com testes falhando, mesmo que a falha pareça não relacionada à alteração feita.

## Regra de Commit

**Sempre que houver qualquer alteração no projeto, realizar o commit imediatamente após a mudança.**
Não acumular alterações sem commitar. Cada conjunto de mudanças relacionadas deve ter seu próprio commit descritivo antes de continuar.

## Status das Features Implementadas

### ✅ Implementado

| Feature | Arquivo | Detalhe |
|---------|---------|---------|
| Cadastro de nome+CPF no login | `pages/auth.html` + `index.html` | Modal DRM obrigatório; salvo via `APIDLM.registerUser()` |
| Biblioteca lista livros da blockchain | `pages/biblioteca.html` + `index.html` | `APIDLM.busca()` + cache `dlm_busca_cache_{wallet}` + fallback localStorage |
| Leitor DLM integrado na biblioteca | `pages/biblioteca.html` | Seleção .dlm → MetaMask sign → `APIDLM.decrypt()` → PDF.js |
| Transferência com nome do destinatário | `pages/biblioteca.html` + `index.html` | `APIDLM.previewTransfer()` → confirma nome → `APIDLM.transfer()` |
| Re-encriptação automática no decrypt | DLM PDF API `POST /decrypt` | Servidor re-cifra para o novo dono e atualiza `encryptedWithAddress` |
| DLM-PDF Platform verifica posse | `DLM PDF API/client/index.html` | Usa `POST /decrypt` — servidor verifica `currentOwner` no registro |
| Cadeia de custódia no decrypt | DLM PDF API `decryptDLMv3WithChain` | Tenta encryptedWithAddress + histórico reverso |

### Features Planejadas (não implementar sem ordem explícita)

1. **Transferência do NFT na blockchain** — acionar `transferToUser(tokenId, newOwnerAddress)` no contrato ERC-721 após a transferência no registro DRM. Atualmente a transferência só atualiza o `licenseRegistry` da API, não o NFT on-chain.

2. **Download automático do .dlm re-encriptado** — após o novo dono abrir o arquivo via `APIDLM.decrypt()`, o servidor retorna o `.dlmBase64` atualizado; o cliente deve oferecer download automático do novo arquivo para o usuário guardar localmente.

3. **Atualização do cache após transferência** — ao concluir uma transferência, remover o livro do `dlm_busca_cache_{wallet}` do cedente para evitar que ele ainda apareça na biblioteca local.
