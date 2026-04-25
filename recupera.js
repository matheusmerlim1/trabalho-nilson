document.addEventListener('DOMContentLoaded', () => {
    const formRecupera = document.getElementById('formRecupera');

    formRecupera.addEventListener('submit', (event) => {
        event.preventDefault();

        // Captura valores do formulário
        const nomeDigitado = document.getElementById('nomeRecupera').value;
        const cpfDigitado = document.getElementById('cpfRecupera').value;
        const novaSenha = document.getElementById('novaSenha').value;
        const confirmaSenha = document.getElementById('confirmarNovaSenha').value;

        // 1. Validar se as senhas coincidem
        if (novaSenha !== confirmaSenha) {
            alert('As novas senhas não coincidem!');
            return;
        }

        // 2. Buscar o usuário no localStorage
        const userSalvo = JSON.parse(localStorage.getItem('utilizadorLogado'));

        if (!userSalvo) {
            alert('Nenhum usuário cadastrado encontrado no sistema.');
            return;
        }

        // 3. Verificar se Nome e CPF batem com o cadastro
        if (userSalvo.nome === nomeDigitado && userSalvo.cpf === cpfDigitado) {
            
            // Atualiza a senha no objeto
            userSalvo.senha = novaSenha;

            // Salva de volta no localStorage
            localStorage.setItem('utilizadorLogado', JSON.stringify(userSalvo));

            alert('Senha atualizada com sucesso! Você será redirecionado para o login.');
            window.location.href = 'index.html';
            
        } else {
            alert('Dados de validação (Nome ou CPF) não conferem com o cadastro.');
        }
    });
});