# DLM Bookstore — Livraria Digital em Blockchain

> **Digital Left Management** — Posse real de livros digitais via NFT Ethereum + PDF protegido por AES-256

---

## 📁 Estrutura do Projeto

```
dlm/
├── contracts/
│   └── DLMBookstore.sol        ← Smart Contract ERC-721 (Solidity)
├── scripts/
│   └── deploy.js               ← Deploy Hardhat
├── backend/
│   ├── server.js               ← API REST Node.js + DRM AES-256
│   └── .env.example            ← Variáveis de ambiente
└── frontend/
    └── index.html              ← Site completo (HTML/CSS/JS)
```

---

## 🔐 Como funciona o DRM do PDF

```
CADASTRO DO LIVRO (admin):
  1. Admin faz upload do PDF original
  2. Servidor gera chave AES-256 + IV únicos para o livro
  3. PDF é cifrado com AES-256-CBC → salvo como book_N.dlmpdf
  4. Chave AES fica em storage/keys/ (nunca exposta)
  5. Hash do PDF cifrado é registrado no Smart Contract

LEITURA:
  6. Usuário autentica (JWT)
  7. Chama POST /api/books/read com tokenId
  8. Servidor verifica ownerOf(tokenId) == wallet na blockchain
  9. Se titular: carrega PDF cifrado → descriptografa NA RAM
 10. PDF original é enviado diretamente ao browser (nunca salvo)

TRANSFERÊNCIA/VENDA:
 11. NFT muda de dono on-chain
 12. Antigo dono perde acesso automaticamente
 13. Novo dono pode ler imediatamente
```

---

## 🚀 Setup Passo a Passo

### 1. Pré-requisitos
- Node.js 18+
- Conta MetaMask com ETH na rede Sepolia (testnet)
- Conta Infura ou Alchemy (URL RPC)

### 2. Smart Contract (Hardhat)

```bash
cd dlm
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
npx hardhat compile
```

Criar `hardhat.config.js`:
```js
require("@nomicfoundation/hardhat-toolbox");
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/SEU_ID",
      accounts: ["0xSUA_CHAVE_PRIVADA_ADMIN"]
    }
  }
};
```

Deploy:
```bash
npx hardhat run scripts/deploy.js --network sepolia
# Copie o endereço do contrato para o .env
```

### 3. Backend

```bash
cd backend
npm install express ethers dotenv cors bcryptjs jsonwebtoken multer uuid fs-extra
cp .env.example .env
# Edite .env com suas chaves
node server.js
```

### 4. Frontend

Abra `frontend/index.html` diretamente no browser  
(ou sirva com `npx serve frontend`)

---

## 🌐 Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/register` | Cadastra usuário (off-chain + blockchain) |
| POST | `/api/login` | Autentica e retorna JWT |
| GET  | `/api/catalog` | Lista livros disponíveis |
| POST | `/api/admin/books/add` | Adiciona livro + cifra PDF (admin) |
| POST | `/api/books/purchase` | Compra livro (mint NFT) |
| POST | `/api/books/read` | **DRM**: verifica posse → descriptografa → envia PDF |
| GET  | `/api/mybooks` | Livros do usuário autenticado |
| POST | `/api/books/transfer` | Transfere livro (por wallet ou username) |
| POST | `/api/books/list-resale` | Lista para revenda no marketplace |
| POST | `/api/books/cancel-resale` | Cancela listagem de revenda |
| GET  | `/api/marketplace` | Lista todos os livros à venda |
| POST | `/api/books/buy-resale` | Compra livro de outro usuário |
| GET  | `/api/books/history/:id` | Histórico de donos de um token |
| GET  | `/api/user/lookup/:id` | Busca usuário por username ou wallet |
| GET  | `/api/books/integrity/:id` | Verifica integridade do PDF cifrado |

---

## 🔑 Variáveis de Ambiente (.env)

```env
RPC_URL=https://sepolia.infura.io/v3/SEU_PROJECT_ID
ADMIN_PRIVATE_KEY=0xSUA_CHAVE_PRIVADA_ADMIN
CONTRACT_ADDRESS=0xENDERECO_DO_CONTRATO
DLM_API_KEY=sua-chave-api-secreta
JWT_SECRET=seu-jwt-secret-longo
PORT=3001
```

---

## ⚠️ Notas de Segurança

- `storage/keys/` **nunca** deve ser exposto publicamente
- `ADMIN_PRIVATE_KEY` **nunca** deve ser commitado no Git
- Em produção: use PostgreSQL/MongoDB, HTTPS, e armazene chaves AES em HSM ou AWS KMS
- O endpoint `/api/books/read` não aceita cache e não salva PDF em disco

---

## 📄 Referências

- DLM-PDF: Transposição da Posse Física para o Livro Digital em Blockchain (DSR)
- PayAPIChain: Blockchain-Enabled Payment System Using API Integration
- ERC-721: Non-Fungible Token Standard (Ethereum)
- AES-256-CBC: NIST FIPS 197
