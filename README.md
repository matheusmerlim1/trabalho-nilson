# DLM Market - Sistema de Gestão de Direitos Digitais 📚🛡️

Este projeto é uma plataforma experimental de Marketplace de livros digitais desenvolvida para a disciplina de **Segurança de Sistemas**, sob orientação do professor **Nilson**. O foco principal é a implementação de conceitos de **DLM (Digital Library Management)** e proteção de direitos autorais através de tecnologias web.

## 🚀 Sobre o Projeto

O **DLM Market** permite que autores independentes publiquem suas obras e que usuários adquiram exemplares digitais. A plataforma simula um ambiente de posse digital real, onde o arquivo adquirido pertence ao usuário e pode ser lido ou transferido (vendido), respeitando a escassez digital.

### Principais Funcionalidades:

- **🔐 Proteção e Encriptação:** Ao realizar o upload de um livro, o sistema processa o arquivo PDF e o armazena em formato encriptado (Base64/Binary), simulando um ambiente de DRM (Digital Rights Management).
- **📝 Marketplace Dinâmico:** Integração entre livros estáticos e livros enviados por usuários em tempo real.
- **👤 Gestão de Usuários:** Sistema de cadastro e login com validação de sessão via `localStorage`.
- **🔄 Transferência de Propriedade (Conceito DLM):** Funcionalidade exclusiva que permite transferir a titularidade de um livro para outro CPF. Ao transferir, o vendedor perde o acesso ao arquivo, garantindo que apenas um dono possua aquela licença digital.
- **🔍 Filtros Inteligentes:** Sistema de busca por título, autor e faixa de preço.

## 🛠️ Tecnologias Utilizadas

- **HTML5 & CSS3:** Estrutura e estilização moderna.
- **JavaScript (ES6+):** Lógica de negócios, manipulação de DOM e módulos.
- **Web Storage API (localStorage):** Persistência de dados do lado do cliente para simulação de banco de dados.
- **FileReader API:** Processamento e encriptação de arquivos PDF em tempo real.

## 📂 Estrutura de Arquivos

- `index.html`: Página principal com vitrine de livros e busca.
- `usuario.html`: Painel do usuário para gerenciar sua biblioteca e anúncios.
- `venda.html`: Interface de transferência de direitos digitais entre usuários.
- `crypto.js`: Lógica de segurança e processamento de arquivos.
- `dados.js`: Base de dados inicial do sistema.

## 🔧 Como Executar o Projeto

1. Clone o repositório:
   ```bash
   git clone [https://github.com/matheusmerlim1/trabalho-nilson.git](https://github.com/matheusmerlim1/trabalho-nilson.git)
