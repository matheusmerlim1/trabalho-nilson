document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const livroId = params.get('id');
    const userLogado = JSON.parse(localStorage.getItem('utilizadorLogado'));
    
    if (!userLogado || !livroId) {
        window.location.href = 'usuario.html';
        return;
    }

    // Encontra o livro na biblioteca do usuário
    const livro = userLogado.biblioteca.find(l => l.id == livroId);
    const containerDetalhes = document.getElementById('detalhes-livro');

    if (livro && containerDetalhes) {
        containerDetalhes.innerHTML = `
            <div style="background: #eee; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <p><strong>Livro:</strong> ${livro.nome}</p>
                <p><strong>Autor:</strong> ${livro.autor}</p>
                <p><strong>ID Digital:</strong> ${livro.id}</p>
            </div>
        `;
    }

    const formTransferir = document.getElementById('form-transferir');
    formTransferir.onsubmit = (e) => {
        e.preventDefault();
        const cpfDestino = document.getElementById('cpf-destino').value.trim();

        if (cpfDestino === userLogado.cpf) {
            alert("Você não pode transferir um livro para si mesmo!");
            return;
        }

        // --- LÓGICA DLM (TRANSFERÊNCIA DE PROPRIEDADE) ---
        
        // 1. Remove o livro da conta de quem está vendendo
        userLogado.biblioteca = userLogado.biblioteca.filter(l => l.id != livroId);
        
        // 2. Atualiza o localStorage do usuário atual
        localStorage.setItem('utilizadorLogado', JSON.stringify(userLogado));

        // 3. Em um sistema real, aqui buscaríamos o registro do destinatário e inseriríamos o livro.
        // Como o localStorage é local por navegador/dispositivo, simulamos o registro da transação:
        console.log(`Transação registrada: Livro ${livroId} enviado para CPF ${cpfDestino}`);

        alert("Transferência realizada com sucesso! O livro foi removido da sua conta e os direitos foram transferidos.");
        window.location.href = 'usuario.html';
    };
});