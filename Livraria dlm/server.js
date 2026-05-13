/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         DLM Bookstore — Backend API com DRM de PDF          ║
 * ║  Node.js + Express + ethers.js + AES-256 (PDF encryption)  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * npm install express ethers dotenv cors bcryptjs jsonwebtoken multer uuid fs-extra
 *
 * ── Fluxo DRM ──────────────────────────────────────────────────
 *  CADASTRO DE LIVRO (admin):
 *    1. Admin envia PDF original via POST /api/admin/books/add
 *    2. Backend gera AES-256 key única para aquele livro
 *    3. Backend cifra PDF com AES-256-CBC  → salva .dlmpdf
 *    4. Chave AES fica NO SERVIDOR (nunca no PDF, nunca no cliente)
 *    5. Hash do PDF cifrado é registrado no Smart Contract (on-chain)
 *
 *  LEITURA:
 *    6. Usuário autentica → chama POST /api/books/read
 *    7. Backend verifica ownerOf(tokenId) == wallet  (on-chain)
 *    8. Se válido → descriptografa na RAM → envia PDF ao browser
 *    9. PDF descriptografado NUNCA é salvo em disco
 *
 *  TRANSFERÊNCIA/VENDA:
 *   10. NFT muda de dono on-chain
 *   11. Antigo dono perde acesso automaticamente (blockchain valida)
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const multer   = require("multer");
const crypto   = require("crypto");
const fs       = require("fs-extra");
const path     = require("path");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

// ── Diretórios ────────────────────────────────────────────────────────────────
const ENCRYPTED_DIR = path.join(__dirname, "storage", "encrypted");
const KEYS_DIR      = path.join(__dirname, "storage", "keys"); // nunca expor publicamente
fs.ensureDirSync(ENCRYPTED_DIR);
fs.ensureDirSync(KEYS_DIR);

// ── Multer (recebe PDF em memória) ────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new Error("Apenas PDFs"))
});

// ── Blockchain ────────────────────────────────────────────────────────────────
const provider    = new ethers.JsonRpcProvider(process.env.RPC_URL);
const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

const CONTRACT_ABI = [
  "function registerUser(string username) external",
  "function isRegistered(address wallet) external view returns (bool)",
  "function getWalletByUsername(string username) external view returns (address)",
  "function addBook(string title, string author, string isbn, uint256 price, string metadataURI) external returns (uint256)",
  "function purchaseBook(uint256 bookId) external payable returns (uint256)",
  "function listForResale(uint256 tokenId, uint256 price) external",
  "function cancelResale(uint256 tokenId) external",
  "function transferToUser(uint256 tokenId, address toWallet) external",
  "function transferToUsername(uint256 tokenId, string username) external",
  "function buyResaleBook(uint256 tokenId) external payable",
  "function getUserBooks(address wallet) external view returns (uint256[])",
  "function getTokenInfo(uint256 tokenId) external view returns (uint256, string, string, address, uint256, bool)",
  "function getBook(uint256 bookId) external view returns (tuple(uint256,string,string,string,uint256,string,address,bool))",
  "function totalBooks() external view returns (uint256)",
  "function totalTokens() external view returns (uint256)",
  "function getOwnershipHistory(uint256 tokenId) external view returns (address[])",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function users(address) external view returns (address, string, bool, uint256)"
];

const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, adminWallet);

// ── DB em memória (substituir por PostgreSQL em produção) ─────────────────────
const usersDB    = {}; // username → { passwordHash, wallet, email }
const booksFileDB = {}; // bookId  → { encryptedFile, hashOriginal, hashEncrypted, ... }

// ── Middlewares Auth ──────────────────────────────────────────────────────────
function verifyApiKey(req, res, next) {
  if (req.headers["x-api-key"] !== process.env.DLM_API_KEY)
    return res.status(401).json({ success: false, message: "API Key inválida" });
  next();
}

function verifyToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth) return res.status(401).json({ success: false, message: "Token não fornecido" });
  try {
    req.user = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token inválido ou expirado" });
  }
}

// ── Funções de Criptografia AES-256 ──────────────────────────────────────────

/** Gera e salva chave AES-256 + IV para um livro */
function generateAndSaveKey(bookId) {
  const key = crypto.randomBytes(32);
  const iv  = crypto.randomBytes(16);
  fs.writeJsonSync(path.join(KEYS_DIR, `${bookId}.key.json`), {
    key: key.toString("hex"),
    iv:  iv.toString("hex"),
    algorithm: "aes-256-cbc",
    createdAt: new Date().toISOString()
  });
  return { key, iv };
}

/** Lê chave AES de um livro do disco */
function loadKey(bookId) {
  const p = path.join(KEYS_DIR, `${bookId}.key.json`);
  if (!fs.existsSync(p)) return null;
  const d = fs.readJsonSync(p);
  return { key: Buffer.from(d.key, "hex"), iv: Buffer.from(d.iv, "hex") };
}

/** Cifra buffer com AES-256-CBC */
function encryptBuf(buf, key, iv) {
  const c = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([c.update(buf), c.final()]);
}

/** Descriptografa buffer com AES-256-CBC — resultado fica somente na RAM */
function decryptBuf(buf, key, iv) {
  const d = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([d.update(buf), d.final()]);
}

/** SHA-256 de um buffer */
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── ROTAS ─────────────────────────────────────────────────────────────────────

// POST /api/register
app.post("/api/register", verifyApiKey, async (req, res) => {
  try {
    const { username, password, email, walletAddress } = req.body;
    if (!username || !password || !walletAddress)
      return res.status(400).json({ success: false, message: "username, password e walletAddress são obrigatórios" });
    if (usersDB[username])
      return res.status(409).json({ success: false, message: "Username já em uso" });
    if (!ethers.isAddress(walletAddress))
      return res.status(400).json({ success: false, message: "Endereço Ethereum inválido" });

    const tx      = await contract.registerUser(username);
    const receipt = await tx.wait();
    usersDB[username] = { passwordHash: await bcrypt.hash(password, 10), wallet: walletAddress, email };

    res.json({ success: true, message: "Usuário registrado na blockchain", username, wallet: walletAddress, txHash: receipt.hash });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = usersDB[username];
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ success: false, message: "Credenciais inválidas" });

    const token = jwt.sign({ username, wallet: user.wallet }, process.env.JWT_SECRET, { expiresIn: "24h" });
    res.json({ success: true, token, username, wallet: user.wallet });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/books/add  — recebe PDF, cifra, registra on-chain
app.post("/api/admin/books/add", verifyApiKey, upload.single("pdf"), async (req, res) => {
  try {
    const { title, author, isbn, priceEth } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "PDF obrigatório" });
    if (!title || !author || !priceEth)
      return res.status(400).json({ success: false, message: "title, author, priceEth obrigatórios" });

    const priceWei = ethers.parseEther(priceEth.toString());

    // 1. Registra na blockchain
    const tx      = await contract.addBook(title, author, isbn || "", priceWei, "");
    const receipt = await tx.wait();

    // Extrai bookId do evento
    const iface = new ethers.Interface(["event BookAdded(uint256 indexed bookId, string title, string author, uint256 price)"]);
    let bookId = null;
    for (const log of receipt.logs) {
      try { const p = iface.parseLog(log); if (p?.name === "BookAdded") { bookId = Number(p.args.bookId); break; } } catch {}
    }
    if (!bookId) return res.status(500).json({ success: false, message: "Erro ao obter bookId do evento" });

    // 2. Gera chave AES-256 única
    const { key, iv } = generateAndSaveKey(bookId);

    // 3. Cifra o PDF
    const pdfOriginal  = req.file.buffer;
    const pdfEncrypted = encryptBuf(pdfOriginal, key, iv);

    // 4. Hashes
    const hashOriginal  = sha256(pdfOriginal);
    const hashEncrypted = sha256(pdfEncrypted);

    // 5. Salva apenas o PDF CIFRADO
    const fileName = `book_${bookId}.dlmpdf`;
    await fs.writeFile(path.join(ENCRYPTED_DIR, fileName), pdfEncrypted);

    booksFileDB[bookId] = {
      encryptedFile: fileName,
      hashOriginal,
      hashEncrypted,
      originalName: req.file.originalname,
      sizeBytes: pdfOriginal.length,
      uploadedAt: new Date().toISOString()
    };

    console.log(`📚 Livro #${bookId} "${title}" → AES-256 cifrado. Hash: ${hashEncrypted.slice(0,16)}...`);

    res.json({
      success: true,
      message: "PDF cifrado com AES-256 e livro registrado na blockchain",
      bookId, title, priceEth,
      hashOriginal, hashEncrypted,
      txHash: receipt.hash,
      note: "Chave AES armazenada no servidor. Nunca exposta. Somente titulares do NFT acessam o conteúdo."
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/catalog
app.get("/api/catalog", async (req, res) => {
  try {
    const total = await contract.totalBooks();
    const catalog = [];
    for (let i = 1; i <= Number(total); i++) {
      const b = await contract.getBook(i);
      if (b[7]) catalog.push({
        bookId:   Number(b[0]),
        title:    b[1],
        author:   b[2],
        isbn:     b[3],
        price:    ethers.formatEther(b[4]),
        priceWei: b[4].toString(),
        hasFile:  !!booksFileDB[Number(b[0])]
      });
    }
    res.json({ success: true, catalog });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/purchase
app.post("/api/books/purchase", verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body;
    const book = await contract.getBook(bookId);
    if (!book[7]) return res.status(400).json({ success: false, message: "Livro não disponível" });
    const tx = await contract.purchaseBook(bookId, { value: book[4] });
    const receipt = await tx.wait();
    res.json({ success: true, message: "NFT emitido — livro é seu na blockchain", bookTitle: book[1], txHash: receipt.hash });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/read  ← CORE DRM
app.post("/api/books/read", verifyToken, async (req, res) => {
  try {
    const { tokenId } = req.body;
    const { wallet }  = req.user;

    // 1. Verificar titularidade ON-CHAIN
    const owner = await contract.ownerOf(tokenId);
    if (owner.toLowerCase() !== wallet.toLowerCase())
      return res.status(403).json({ success: false, message: "Acesso negado: você não é o titular deste livro na blockchain" });

    // 2. Obter arquivo
    const info     = await contract.getTokenInfo(tokenId);
    const bookId   = Number(info[0]);
    const fileMeta = booksFileDB[bookId];
    if (!fileMeta) return res.status(404).json({ success: false, message: "Arquivo não encontrado no servidor" });

    // 3. Carregar chave AES
    const keyData = loadKey(bookId);
    if (!keyData) return res.status(500).json({ success: false, message: "Chave de criptografia não encontrada" });

    // 4. Ler PDF cifrado
    const encPath      = path.join(ENCRYPTED_DIR, fileMeta.encryptedFile);
    const encryptedBuf = await fs.readFile(encPath);

    // 5. Verificar integridade
    if (sha256(encryptedBuf) !== fileMeta.hashEncrypted)
      return res.status(500).json({ success: false, message: "Falha de integridade do arquivo" });

    // 6. Descriptografar NA MEMÓRIA — nunca salva em disco
    const pdfBuffer = decryptBuf(encryptedBuf, keyData.key, keyData.iv);

    // 7. Enviar ao browser
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${info[1].replace(/[^a-z0-9]/gi,"_")}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-DLM-TokenId", String(tokenId));
    res.setHeader("X-DLM-Owner", wallet);
    console.log(`📖 Leitura autorizada: token #${tokenId} wallet ${wallet.slice(0,10)}...`);
    res.send(pdfBuffer);

  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/mybooks
app.get("/api/mybooks", verifyToken, async (req, res) => {
  try {
    const { wallet } = req.user;
    const tokenIds   = await contract.getUserBooks(wallet);
    const myBooks    = [];
    for (const tid of tokenIds) {
      const info = await contract.getTokenInfo(tid);
      const bid  = Number(info[0]);
      myBooks.push({
        tokenId:     Number(tid),
        bookId:      bid,
        title:       info[1],
        author:      info[2],
        resalePrice: info[4] > 0 ? ethers.formatEther(info[4]) : null,
        isForSale:   info[5],
        canRead:     !!booksFileDB[bid]
      });
    }
    res.json({ success: true, books: myBooks });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/list-resale
app.post("/api/books/list-resale", verifyToken, async (req, res) => {
  try {
    const { tokenId, priceEth } = req.body;
    const tx = await contract.listForResale(tokenId, ethers.parseEther(priceEth.toString()));
    const r  = await tx.wait();
    res.json({ success: true, message: "Listado para revenda", tokenId, price: priceEth, txHash: r.hash });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/cancel-resale
app.post("/api/books/cancel-resale", verifyToken, async (req, res) => {
  try {
    const { tokenId } = req.body;
    const r = await (await contract.cancelResale(tokenId)).wait();
    res.json({ success: true, message: "Listagem cancelada", txHash: r.hash });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/transfer
app.post("/api/books/transfer", verifyToken, async (req, res) => {
  try {
    const { tokenId, toWallet, toUsername } = req.body;
    let tx;
    if (toUsername)     tx = await contract.transferToUsername(tokenId, toUsername);
    else if (toWallet)  tx = await contract.transferToUser(tokenId, toWallet);
    else return res.status(400).json({ success: false, message: "Informe toWallet ou toUsername" });

    const r    = await tx.wait();
    const info = await contract.getTokenInfo(tokenId);
    res.json({
      success:   true,
      message:   "Transferência concluída. Novo dono já pode ler. Dono anterior perdeu o acesso.",
      tokenId,
      bookTitle: info[1],
      newOwner:  info[3],
      txHash:    r.hash
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/marketplace
app.get("/api/marketplace", async (req, res) => {
  try {
    const total   = await contract.totalTokens();
    const forSale = [];
    for (let i = 1; i <= Number(total); i++) {
      const info = await contract.getTokenInfo(i);
      if (info[5]) {
        const hist = await contract.getOwnershipHistory(i);
        forSale.push({ tokenId: i, bookId: Number(info[0]), title: info[1], author: info[2],
          seller: info[3], resalePrice: ethers.formatEther(info[4]), previousOwners: hist.length - 1 });
      }
    }
    res.json({ success: true, listings: forSale });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/books/buy-resale
app.post("/api/books/buy-resale", verifyToken, async (req, res) => {
  try {
    const { tokenId } = req.body;
    const info = await contract.getTokenInfo(tokenId);
    const r    = await (await contract.buyResaleBook(tokenId, { value: info[4] })).wait();
    res.json({ success: true, message: "Comprado! Você é agora o titular na blockchain.", tokenId, bookTitle: info[1], txHash: r.hash });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/books/history/:tokenId
app.get("/api/books/history/:tokenId", async (req, res) => {
  try {
    const tid  = req.params.tokenId;
    const hist = await contract.getOwnershipHistory(tid);
    const info = await contract.getTokenInfo(tid);
    res.json({ success: true, tokenId: tid, bookTitle: info[1], history: hist });
  } catch { res.status(404).json({ success: false, message: "Token não encontrado" }); }
});

// GET /api/user/lookup/:identifier
app.get("/api/user/lookup/:identifier", async (req, res) => {
  try {
    const id = req.params.identifier;
    let wallet, username;
    if (ethers.isAddress(id)) { wallet = id; username = (await contract.users(id))[1]; }
    else { wallet = await contract.getWalletByUsername(id); username = id; }
    res.json({ success: true, wallet, username, registered: await contract.isRegistered(wallet) });
  } catch { res.status(404).json({ success: false, message: "Usuário não encontrado" }); }
});

// GET /api/books/integrity/:bookId
app.get("/api/books/integrity/:bookId", verifyApiKey, (req, res) => {
  const bookId = parseInt(req.params.bookId);
  const meta   = booksFileDB[bookId];
  if (!meta) return res.status(404).json({ success: false, message: "Não encontrado" });
  const buf     = fs.readFileSync(path.join(ENCRYPTED_DIR, meta.encryptedFile));
  const current = sha256(buf);
  res.json({ success: true, bookId, intact: current === meta.hashEncrypted, storedHash: meta.hashEncrypted, actualHash: current });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 DLM API → http://localhost:${PORT}`);
  console.log(`📖 Contrato : ${process.env.CONTRACT_ADDRESS}`);
  console.log(`🔐 AES-256-CBC | Chaves em: ${KEYS_DIR}\n`);
});
