import { livrosDisponiveis } from './dados.js';

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const idBuscado = params.get('id');

    const mercado = JSON.parse(localStorage.getItem('livrosMarketplace')) || [];
    const todos = [...livrosDisponiveis, ...mercado];
    
    // Comparação usando == para evitar erro de String vs Number
    const livro = todos.find(l => l.id == idBuscado);

    if (livro) {
        document.getElementById('info-livro').innerHTML = `<h3>${livro.nome}</h3>`;
        
        document.getElementById('btnConfirmarCompra').onclick = (e) => {
            e.preventDefault();
            let user = JSON.parse(localStorage.getItem('utilizadorLogado'));
            
            if (!user.biblioteca) user.biblioteca = [];
            
            // Evita duplicados na biblioteca
            if (!user.biblioteca.find(l => l.id == livro.id)) {
                user.biblioteca.push(livro);
                localStorage.setItem('utilizadorLogado', JSON.stringify(user));
                alert("Compra realizada!");
            } else {
                alert("Você já possui este livro.");
            }
            
            window.location.href = 'usuario.html';
        };
    }
});