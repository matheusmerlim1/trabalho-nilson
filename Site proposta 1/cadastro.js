document.addEventListener('DOMContentLoaded', () => {
    const formCadastro = document.getElementById('formCadastro');

    formCadastro.addEventListener('submit', (event) => {
        event.preventDefault();

        // Captura os valores via ID
        const nome = document.getElementById('nome').value;
        const cpf = document.getElementById('cpf').value;
        const dataNasc = document.getElementById('dataNasc').value;
        const senha = document.getElementById('senha').value;
        const confirmarSenha = document.getElementById('confirmarSenha').value;
        
        // Verificação de senha
        if (senha !== confirmarSenha) {
            alert('As senhas não coincidem. Por favor, tente novamente.');
            return; // Interrompe a execução
        }

        // Gerar um token simples (simulando a lógica do artigo de Blockchain/DLM)
        const token = "DLM-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const novoUtilizador = {
            nome,
            cpf,
            dataNasc,
            senha, // Senha salva para conferência no login
            token,
            biblioteca: [] 
        };

        // Salva uma lista de usuários para não sobrescrever caso queira ter mais de um
        // Mas mantendo sua lógica de 'utilizadorLogado' para persistência simples:
        localStorage.setItem('utilizadorLogado', JSON.stringify(novoUtilizador));

        alert(`Cadastro realizado com sucesso!\nSeu token DLM é: ${token}`);
        
        // Redireciona para o index para fazer login
        window.location.href = 'index.html';
    });
});