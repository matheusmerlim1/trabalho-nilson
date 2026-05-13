import { livrosDisponiveis } from './dados.js';

const reais = valor => valor.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });

/**
 * Renderiza a tabela combinando dados fixos e do localStorage
 */
function desenharTabela(filtroNome = "", filtroAutor = "", filtroPreco = Infinity) {
    const tbody = document.getElementById('lista-livros');
    if (!tbody) return;

    // 1. Busca livros enviados por usuários no localStorage
    const livrosExtra = JSON.parse(localStorage.getItem('livrosMarketplace')) || [];
    
    // 2. Une as duas listas
    const todosOsLivros = [...livrosDisponiveis, ...livrosExtra];

    // 3. Aplica os filtros
    const livrosFiltrados = todosOsLivros.filter(livro => {
        const matchesNome = livro.nome.toLowerCase().includes(filtroNome.toLowerCase());
        const matchesAutor = livro.autor.toLowerCase().includes(filtroAutor.toLowerCase());
        const matchesPreco = livro.preco <= (filtroPreco || Infinity);
        return matchesNome && matchesAutor && matchesPreco;
    });

    // 4. Renderiza
    if (livrosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nenhum livro encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = livrosFiltrados.map(livro => `
        <tr>
            <td>${livro.nome}</td>
            <td>${livro.autor}</td>
            <td>${reais(livro.preco)}</td>
            <td><a href="compra.html?id=${livro.id}" class="btn-buy">Comprar</a></td>
        </tr>
    `).join('');
}

/**
 * Configura os eventos de pesquisa
 */
function configurarPesquisa() {
    const btnSearch = document.getElementById('btnSearch');
    const btnClear = document.getElementById('btnClearSearch');

    btnSearch.onclick = () => {
        const nome = document.getElementById('searchNome').value;
        const autor = document.getElementById('searchAutor').value;
        const preco = parseFloat(document.getElementById('searchPreco').value);
        desenharTabela(nome, autor, preco);
    };

    btnClear.onclick = () => {
        document.getElementById('searchNome').value = "";
        document.getElementById('searchAutor').value = "";
        document.getElementById('searchPreco').value = "";
        desenharTabela();
    };
}

/**
 * Verifica se há uma sessão ativa e atualiza o Header
 */
function gerenciarSessao() {
    const navUser = document.getElementById('nav-user');
    const sessaoAtiva = localStorage.getItem('sessaoAtiva');
    const userLogado = JSON.parse(localStorage.getItem('utilizadorLogado'));

    if (sessaoAtiva === 'true' && userLogado) {
        const primeiroNome = userLogado.nome.split(' ')[0];
        navUser.innerHTML = `
            <a href="usuario.html" class="user-link" style="text-decoration: none; color: white; font-weight: bold;">
                👤 Olá, ${primeiroNome}
            </a>
            <button id="btnLogout" style="margin-left: 15px; background: #e74c3c; border-radius: 4px; color: white; cursor: pointer; border: none; padding: 5px 10px;">Sair</button>
        `;

        document.getElementById('btnLogout').onclick = () => {
            localStorage.setItem('sessaoAtiva', 'false');
            window.location.reload();
        };
    }
}

function configurarModal() {
    const dialog = document.getElementById('loginDialog');
    const btnOpenLogin = document.getElementById('btnOpenLogin');
    const btnCloseLogin = document.getElementById('btnCloseLogin');
    const formLogin = document.getElementById('formLogin');

    if (btnOpenLogin) btnOpenLogin.onclick = () => dialog.showModal();
    if (btnCloseLogin) btnCloseLogin.onclick = () => dialog.close();

    if (formLogin) {
        formLogin.onsubmit = (e) => {
            e.preventDefault();
            const cpfInput = document.getElementById('userLogin').value.trim();
            const senhaInput = document.getElementById('passLogin').value;
            const stringDados = localStorage.getItem('utilizadorLogado');
            
            if (!stringDados) {
                alert('Nenhum usuário encontrado. Por favor, cadastre-se.');
                return;
            }

            const contaSalva = JSON.parse(stringDados);

            if (contaSalva.cpf === cpfInput && contaSalva.senha === senhaInput) {
                alert(`Login efetuado com sucesso!`);
                localStorage.setItem('sessaoAtiva', 'true'); 
                dialog.close();
                window.location.reload(); 
            } else {
                alert('CPF ou Senha incorretos.');
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    desenharTabela();
    gerenciarSessao();
    configurarModal();
    configurarPesquisa();
});