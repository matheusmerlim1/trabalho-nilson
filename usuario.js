/**
 * Utilitários de Criptografia (Simulação de DRM/DLM)
 * Converte o arquivo em uma String Protegida
 */


async function encriptarArquivo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Em um sistema real, usaríamos a Web Crypto API aqui.
            // Para o protótipo, vamos converter para Base64 (codificação de dados).
            const base64String = reader.result;
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}



function abrirPDF(base64Data) {
    try {
        const base64 = base64Data.split(',')[1]; // remove "data:application/pdf;base64,"

        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });

        const url = URL.createObjectURL(blob);
        window.open(url);

    } catch (e) {
        console.error("Erro ao abrir PDF:", e);
        alert("Erro ao abrir o arquivo. Dados corrompidos.");
    }
}

window.abrirPDFPorId = function(id) {
    const user = JSON.parse(localStorage.getItem('utilizadorLogado'));
    const mercado = JSON.parse(localStorage.getItem('livrosMarketplace')) || [];

    let livro = user?.biblioteca?.find(l => l.id == id);

    if (!livro) {
        livro = mercado.find(l => l.id == id);
    }

    if (!livro) {
        alert("Livro não encontrado.");
        return;
    }

    console.log("Livro encontrado:", livro);

    // CASO 1: livro com base64 (upload)
    if (livro.conteudoBinario) {
        abrirPDF(livro.conteudoBinario);
        return;
    }

    // CASO 2: livro com caminho local
    if (livro.caminhoPdf) {
        window.open(livro.caminhoPdf);
        return;
    }

    // 🚨 fallback
    alert("Este livro não possui conteúdo disponível.");
};

window.abrirPDFPorId = abrirPDFPorId;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de Sessão
    const userLogado = JSON.parse(localStorage.getItem('utilizadorLogado'));
    const sessaoAtiva = localStorage.getItem('sessaoAtiva');

    if (!userLogado || sessaoAtiva !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    // 2. Atualizar Nome no Header
    const elementoNome = document.getElementById('nome-usuario');
    if (elementoNome) {
        elementoNome.textContent = `Olá, ${userLogado.nome.split(' ')[0]}`;
    }

    // --- LÓGICA DE IMPORTAÇÃO E ENCRIPTAÇÃO (VENDER NOVO LIVRO) ---
    const formVenda = document.getElementById('form-venda');
    if (formVenda) {
        formVenda.onsubmit = async (e) => {
            e.preventDefault();

            const nome = document.getElementById('nome-livro').value;
            const preco = parseFloat(document.getElementById('valor-livro').value);
            const inputArquivo = document.getElementById('arquivo-pdf');

            if (inputArquivo.files.length === 0) {
                alert("Por favor, selecione um arquivo PDF.");
                return;
            }

            try {
                // Simulação de Encriptação DLM
                const arquivoProtegido = await encriptarArquivo(inputArquivo.files[0]);

                const novoLivro = {
                    id: Date.now(),
                    nome: nome,
                    autor: userLogado.nome,
                    preco: preco,
                    conteudoBinario: arquivoProtegido, // O arquivo agora é puro dado
                    dataUpload: new Date().toLocaleDateString()
                };

                // Salva no Marketplace Global (localStorage)
                const mercado = JSON.parse(localStorage.getItem('livrosMarketplace')) || [];
                mercado.push(novoLivro);
                localStorage.setItem('livrosMarketplace', JSON.stringify(mercado));

                alert("Livro encriptado e anunciado com sucesso!");
                formVenda.reset();
                window.location.reload();
            } catch (err) {
                alert("Erro ao processar arquivo: " + err);
            }
        };
    }

    // --- TABELA 1: LIVROS DO AUTOR (IMPORTADOS POR ELE) ---
    const renderizarTabelaAutor = () => {
        const tabelaVendas = document.getElementById('tabela-vendas');
        if (!tabelaVendas) return;

        const mercadoGeral = JSON.parse(localStorage.getItem('livrosMarketplace')) || [];
        // Filtra livros onde o autor é o usuário logado
        const meusAnuncios = mercadoGeral.filter(l => l.autor === userLogado.nome);

        if (meusAnuncios.length === 0) {
            tabelaVendas.innerHTML = `<tr><td colspan="3">Você ainda não anunciou livros.</td></tr>`;
            return;
        }

        tabelaVendas.innerHTML = meusAnuncios.map(livro => `
            <tr>
                <td>${livro.nome}</td>
                <td>R$ ${livro.preco.toFixed(2)}</td>
                <td>
                    <button class="btn-read" onclick="abrirPDFPorId(${livro.id})">
                        Ver Original
                    </button>
                </td>
            </tr>
        `).join('');
    };

    // --- TABELA 2: LIVROS COMPRADOS (BIBLIOTECA COM DRM) ---
    const renderizarTabelaBiblioteca = () => {
        const tabelaBiblioteca = document.getElementById('tabela-biblioteca');
        if (!tabelaBiblioteca) return;

        const biblioteca = userLogado.biblioteca || [];

        if (biblioteca.length === 0) {
            tabelaBiblioteca.innerHTML = `<tr><td colspan="4">Sua biblioteca está vazia.</td></tr>`;
            return;
        }

        tabelaBiblioteca.innerHTML = biblioteca.map(livro => `
            <tr>
                <td>${livro.nome}</td>
                <td>${livro.autor}</td>
                <td>
                    <button class="btn-read" style="background:#3498db" 
                        onclick="abrirPDFPorId(${livro.id})">
                        Abrir PDF (DLM)
                    </button>
                </td>
                <td>
                    <button class="btn-buy" style="background:#27ae60; padding: 5px 10px; font-size: 12px;" 
                        onclick="window.location.href='venda.html?id=${livro.id}'">
                        Transferir
                    </button>
                </td>
            </tr>
        `).join('');
    };

    // Inicializa as tabelas
    renderizarTabelaAutor();
    renderizarTabelaBiblioteca();
});