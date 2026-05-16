/**
 * scripts/check-commits.js
 * Verifica se o repositório está limpo, commitado e sincronizado com origin.
 *
 * Uso: node scripts/check-commits.js
 * Retorna exit code 0 se tudo estiver ok, 1 se houver problemas.
 */

const { execSync } = require('child_process');

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';

let hasError = false;

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function ok(msg)   { console.log(`${GREEN}  ✅ ${msg}${RESET}`); }
function fail(msg) { console.log(`${RED}  ❌ ${msg}${RESET}`); hasError = true; }
function warn(msg) { console.log(`${YELLOW}  ⚠️  ${msg}${RESET}`); }
function title(msg){ console.log(`\n${BOLD}${msg}${RESET}`); }

// ── 1. Working tree limpo ─────────────────────────────────────────────────────
title('1. Arquivos não commitados');

const status = run('git status --porcelain');
if (!status) {
  ok('Working tree limpo — nenhum arquivo modificado ou não rastreado.');
} else {
  const lines = status.split('\n');
  const staged    = lines.filter(l => l[0] !== ' ' && l[0] !== '?').map(l => l.slice(3));
  const unstaged  = lines.filter(l => l[1] === 'M' || l[1] === 'D').map(l => l.slice(3));
  const untracked = lines.filter(l => l.startsWith('??')).map(l => l.slice(3));

  if (staged.length)    fail(`Arquivos staged sem commit:\n    ${staged.join('\n    ')}`);
  if (unstaged.length)  fail(`Arquivos modificados não staged:\n    ${unstaged.join('\n    ')}`);
  if (untracked.length) warn(`Arquivos não rastreados (verifique se precisam de .gitignore):\n    ${untracked.join('\n    ')}`);
}

// ── 2. Sincronização com origin ───────────────────────────────────────────────
title('2. Sincronização com origin/main');

try {
  run('git fetch origin --quiet');
  const branch  = run('git rev-parse --abbrev-ref HEAD');
  const remote  = `origin/${branch}`;
  const behind  = parseInt(run(`git rev-list --count HEAD..${remote}`), 10);
  const ahead   = parseInt(run(`git rev-list --count ${remote}..HEAD`), 10);

  if (behind === 0) {
    ok('Origin está atualizado (nenhum commit pendente de push).');
  } else {
    fail(`${behind} commit(s) locais não enviados para origin. Execute: git push`);
  }

  if (ahead > 0) {
    warn(`Existem ${ahead} commit(s) em origin não aplicados localmente. Execute: git pull`);
  }
} catch {
  warn('Não foi possível verificar origin (sem conexão ou remote não configurado).');
}

// ── 3. Arquivos proibidos no tracking ────────────────────────────────────────
title('3. Arquivos sensíveis rastreados pelo git');

const PROIBIDOS = ['.env', 'storage/keys', 'storage/encrypted', '.claude/settings.local.json'];
const trackedFiles = run('git ls-files').split('\n');

PROIBIDOS.forEach(p => {
  // Checar correspondência exata ou prefixo de diretório (com /)
  const found = trackedFiles.some(f => f === p || f.startsWith(p + '/'));
  if (found) {
    fail(`Arquivo sensível rastreado pelo git: ${p} — adicione ao .gitignore e remova com git rm --cached`);
  } else {
    ok(`"${p}" não está no repositório.`);
  }
});

// ── 4. Cache-busting consistente nas páginas HTML ────────────────────────────
title('4. Versão de cache-busting nos arquivos HTML');

const { readFileSync, readdirSync } = require('fs');
const path = require('path');

const HTML_DIRS = ['.', 'pages'];
const SCRIPTS_ESPERADOS = ['api.js', 'app.js', 'style.css'];

let versoes = {};
let htmlFiles = [];

HTML_DIRS.forEach(dir => {
  try {
    readdirSync(path.join(__dirname, '..', dir))
      .filter(f => f.endsWith('.html'))
      .forEach(f => htmlFiles.push(path.join(__dirname, '..', dir, f)));
  } catch { /* diretório não existe */ }
});

htmlFiles.forEach(filePath => {
  const rel     = path.relative(path.join(__dirname, '..'), filePath);
  const content = readFileSync(filePath, 'utf8');

  SCRIPTS_ESPERADOS.forEach(script => {
    const match = content.match(new RegExp(`${script.replace('.', '\\.')}\\?v=(\\d+)`));
    if (match) {
      const v = match[1];
      if (!versoes[script]) versoes[script] = { v, files: [] };
      if (versoes[script].v !== v) {
        fail(`Versão inconsistente de "${script}" em ${rel}: encontrado ?v=${v}, esperado ?v=${versoes[script].v}`);
      } else {
        versoes[script].files.push(rel);
      }
    } else if (content.includes(script)) {
      fail(`"${script}" em ${rel} não tem cache-busting (?v=N)`);
    }
  });
});

if (!hasError) {
  SCRIPTS_ESPERADOS.forEach(s => {
    if (versoes[s]) ok(`"${s}" em ?v=${versoes[s].v} em ${versoes[s].files.length} arquivo(s).`);
  });
}

// ── 5. Resultado final ────────────────────────────────────────────────────────
console.log('');
if (hasError) {
  console.log(`${RED}${BOLD}FALHOU — corrija os problemas acima antes de continuar.${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}OK — repositório limpo, commitado e sincronizado.${RESET}`);
  process.exit(0);
}
