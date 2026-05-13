// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DLMBookstore
 * @dev Livraria Digital DLM - Gestão de posse de livros digitais via Blockchain
 *      Baseado nos princípios do DLM-PDF (Digital Left Management)
 *      Cada livro é um NFT ERC-721 transferível entre usuários
 */
contract DLMBookstore is ERC721, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    Counters.Counter private _bookIds;

    // ─── Structs ───────────────────────────────────────────────────────────────

    struct Book {
        uint256 bookId;
        string title;
        string author;
        string isbn;
        uint256 price;      // em wei
        string metadataURI; // hash IPFS ou URL do metadata
        address publisher;
        bool active;
    }

    struct UserProfile {
        address wallet;
        string username;
        bool registered;
        uint256 registeredAt;
    }

    // ─── Storage ───────────────────────────────────────────────────────────────

    // bookId => Book
    mapping(uint256 => Book) public books;

    // tokenId => bookId (qual livro esse NFT representa)
    mapping(uint256 => uint256) public tokenToBook;

    // wallet => UserProfile
    mapping(address => UserProfile) public users;

    // username => wallet (busca por login)
    mapping(string => address) public usernameToWallet;

    // wallet => tokenIds que possui
    mapping(address => uint256[]) public userTokens;

    // tokenId => preço de revenda (0 = não está à venda)
    mapping(uint256 => uint256) public tokenResalePrice;

    // tokenId => histórico de transferências
    mapping(uint256 => address[]) public ownershipHistory;

    // ─── Events ────────────────────────────────────────────────────────────────

    event UserRegistered(address indexed wallet, string username, uint256 timestamp);
    event BookAdded(uint256 indexed bookId, string title, string author, uint256 price);
    event BookPurchased(uint256 indexed tokenId, uint256 indexed bookId, address indexed buyer, uint256 price);
    event BookListedForResale(uint256 indexed tokenId, address indexed seller, uint256 price);
    event BookResaleCancelled(uint256 indexed tokenId, address indexed seller);
    event BookResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor() ERC721("DLM Digital Book", "DLMBOOK") Ownable(msg.sender) {}

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyRegistered() {
        require(users[msg.sender].registered, "DLM: usuario nao registrado");
        _;
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "DLM: nao e o dono do token");
        _;
    }

    // ─── User Management ───────────────────────────────────────────────────────

    /**
     * @dev Registra um novo usuário vinculando sua wallet ao sistema DLM
     * @param username Login único do usuário
     */
    function registerUser(string memory username) external {
        require(!users[msg.sender].registered, "DLM: carteira ja registrada");
        require(bytes(username).length >= 3, "DLM: username muito curto");
        require(usernameToWallet[username] == address(0), "DLM: username ja em uso");

        users[msg.sender] = UserProfile({
            wallet: msg.sender,
            username: username,
            registered: true,
            registeredAt: block.timestamp
        });

        usernameToWallet[username] = msg.sender;

        emit UserRegistered(msg.sender, username, block.timestamp);
    }

    /**
     * @dev Verifica se uma wallet está registrada
     */
    function isRegistered(address wallet) external view returns (bool) {
        return users[wallet].registered;
    }

    /**
     * @dev Busca wallet de um usuário pelo username
     */
    function getWalletByUsername(string memory username) external view returns (address) {
        address wallet = usernameToWallet[username];
        require(wallet != address(0), "DLM: usuario nao encontrado");
        return wallet;
    }

    // ─── Book Management (apenas owner/admin) ──────────────────────────────────

    /**
     * @dev Adiciona um novo livro ao catálogo da livraria
     */
    function addBook(
        string memory title,
        string memory author,
        string memory isbn,
        uint256 price,
        string memory metadataURI
    ) external onlyOwner returns (uint256) {
        _bookIds.increment();
        uint256 newBookId = _bookIds.current();

        books[newBookId] = Book({
            bookId: newBookId,
            title: title,
            author: author,
            isbn: isbn,
            price: price,
            metadataURI: metadataURI,
            publisher: msg.sender,
            active: true
        });

        emit BookAdded(newBookId, title, author, price);
        return newBookId;
    }

    /**
     * @dev Atualiza o preço de um livro
     */
    function updateBookPrice(uint256 bookId, uint256 newPrice) external onlyOwner {
        require(books[bookId].active, "DLM: livro nao encontrado");
        books[bookId].price = newPrice;
    }

    /**
     * @dev Desativa um livro do catálogo
     */
    function deactivateBook(uint256 bookId) external onlyOwner {
        books[bookId].active = false;
    }

    // ─── Purchase ──────────────────────────────────────────────────────────────

    /**
     * @dev Compra um livro - mint de um NFT para o comprador
     *      O pagamento vai para o owner da livraria
     */
    function purchaseBook(uint256 bookId) external payable onlyRegistered returns (uint256) {
        Book memory book = books[bookId];
        require(book.active, "DLM: livro nao disponivel");
        require(msg.value >= book.price, "DLM: valor insuficiente");

        // Mint do NFT
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(msg.sender, newTokenId);
        tokenToBook[newTokenId] = bookId;
        userTokens[msg.sender].push(newTokenId);
        ownershipHistory[newTokenId].push(msg.sender);

        // Pagamento para a livraria
        payable(owner()).transfer(msg.value);

        emit BookPurchased(newTokenId, bookId, msg.sender, msg.value);
        return newTokenId;
    }

    // ─── Resale (C2C) ──────────────────────────────────────────────────────────

    /**
     * @dev Lista um livro para revenda com preço
     * @param tokenId Token do livro a vender
     * @param price Preço de revenda em wei
     */
    function listForResale(uint256 tokenId, uint256 price)
        external
        onlyRegistered
        onlyTokenOwner(tokenId)
    {
        require(price > 0, "DLM: preco deve ser maior que zero");
        tokenResalePrice[tokenId] = price;
        emit BookListedForResale(tokenId, msg.sender, price);
    }

    /**
     * @dev Cancela a listagem de revenda
     */
    function cancelResale(uint256 tokenId)
        external
        onlyRegistered
        onlyTokenOwner(tokenId)
    {
        require(tokenResalePrice[tokenId] > 0, "DLM: livro nao esta a venda");
        tokenResalePrice[tokenId] = 0;
        emit BookResaleCancelled(tokenId, msg.sender);
    }

    /**
     * @dev Transferência direta para outro usuário por wallet ou username
     *      Sem pagamento - doação/transferência
     * @param tokenId Token a transferir
     * @param toWallet Endereço do destinatário
     */
    function transferToUser(uint256 tokenId, address toWallet)
        external
        onlyRegistered
        onlyTokenOwner(tokenId)
    {
        require(users[toWallet].registered, "DLM: destinatario nao registrado na DLM");
        require(tokenResalePrice[tokenId] == 0, "DLM: cancele a listagem de venda antes");

        address from = msg.sender;
        _transfer(from, toWallet, tokenId);

        // Atualiza histórico
        _removeFromUserTokens(from, tokenId);
        userTokens[toWallet].push(tokenId);
        ownershipHistory[tokenId].push(toWallet);

        emit BookResold(tokenId, from, toWallet, 0);
    }

    /**
     * @dev Transferência por username (conveniência)
     */
    function transferToUsername(uint256 tokenId, string memory username)
        external
        onlyRegistered
        onlyTokenOwner(tokenId)
    {
        address toWallet = usernameToWallet[username];
        require(toWallet != address(0), "DLM: usuario destinatario nao encontrado");
        require(users[toWallet].registered, "DLM: destinatario nao registrado");
        require(tokenResalePrice[tokenId] == 0, "DLM: cancele a listagem de venda antes");

        address from = msg.sender;
        _transfer(from, toWallet, tokenId);

        _removeFromUserTokens(from, tokenId);
        userTokens[toWallet].push(tokenId);
        ownershipHistory[tokenId].push(toWallet);

        emit BookResold(tokenId, from, toWallet, 0);
    }

    /**
     * @dev Compra um livro listado para revenda (C2C)
     * @param tokenId Token do livro à venda
     */
    function buyResaleBook(uint256 tokenId) external payable onlyRegistered {
        uint256 price = tokenResalePrice[tokenId];
        require(price > 0, "DLM: livro nao esta a venda");
        require(msg.value >= price, "DLM: valor insuficiente");

        address seller = ownerOf(tokenId);
        require(seller != msg.sender, "DLM: nao pode comprar seu proprio livro");

        // Zera o preço de revenda
        tokenResalePrice[tokenId] = 0;

        // Transfere NFT
        _transfer(seller, msg.sender, tokenId);
        _removeFromUserTokens(seller, tokenId);
        userTokens[msg.sender].push(tokenId);
        ownershipHistory[tokenId].push(msg.sender);

        // Pagamento ao vendedor (90%) e taxa à livraria (10%)
        uint256 fee = msg.value / 10;
        uint256 sellerAmount = msg.value - fee;
        payable(seller).transfer(sellerAmount);
        payable(owner()).transfer(fee);

        emit BookResold(tokenId, seller, msg.sender, price);
    }

    // ─── Queries ───────────────────────────────────────────────────────────────

    /**
     * @dev Retorna todos os tokenIds de livros que um usuário possui
     */
    function getUserBooks(address wallet) external view returns (uint256[] memory) {
        return userTokens[wallet];
    }

    /**
     * @dev Retorna histórico de proprietários de um token
     */
    function getOwnershipHistory(uint256 tokenId) external view returns (address[] memory) {
        return ownershipHistory[tokenId];
    }

    /**
     * @dev Retorna dados completos de um token (livro + dono atual)
     */
    function getTokenInfo(uint256 tokenId) external view returns (
        uint256 bookId,
        string memory title,
        string memory author,
        address currentOwner,
        uint256 resalePrice,
        bool isForSale
    ) {
        bookId = tokenToBook[tokenId];
        Book memory book = books[bookId];
        title = book.title;
        author = book.author;
        currentOwner = ownerOf(tokenId);
        resalePrice = tokenResalePrice[tokenId];
        isForSale = resalePrice > 0;
    }

    /**
     * @dev Retorna informações de um livro do catálogo
     */
    function getBook(uint256 bookId) external view returns (Book memory) {
        return books[bookId];
    }

    /**
     * @dev Total de livros no catálogo
     */
    function totalBooks() external view returns (uint256) {
        return _bookIds.current();
    }

    /**
     * @dev Total de tokens (exemplares) emitidos
     */
    function totalTokens() external view returns (uint256) {
        return _tokenIds.current();
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _removeFromUserTokens(address user, uint256 tokenId) internal {
        uint256[] storage tokens = userTokens[user];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }
}
