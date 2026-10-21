// Publica na Netlify a partir de uma cópia limpa do git (worktree), sem nenhum .env local.
// Depois confere, no site no ar, que as rotas recusam quem não passou pelo Turnstile;
// se alguma responder 200, volta para o deploy anterior e sai com erro.
//
// Por quê: em 21/10/2026 o adaptador da Netlify copiou o .env.local (com KITESCOLA_LOCAL=1)
// para dentro da função, e a proteção anti-robô ficou desligada em produção.
//
// Uso: npm run publicar   (exige árvore git limpa e netlify-cli logado)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SITE_ID = "c60adb6e-659c-4bd0-923c-5afa2afe0c35";
const URL = "https://kitescola.biazin.com.br";
const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
const netlify = win ? "netlify.cmd" : "netlify";

function rodar(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: win });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} falhou (código ${r.status})`);
}
function saida(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", shell: win, stdio: ["ignore", "pipe", "pipe"] });
}

/** Lista arquivos .env* dentro de uma pasta (recursivo), para garantir que nenhum foi junto. */
function envsEm(pasta) {
  const achados = [];
  if (!existsSync(pasta)) return achados;
  for (const nome of readdirSync(pasta)) {
    const p = path.join(pasta, nome);
    if (nome === "node_modules") continue;
    if (statSync(p).isDirectory()) achados.push(...envsEm(p));
    else if (/^\.env/.test(nome) && nome !== ".env.example") achados.push(p);
  }
  return achados;
}

async function conferirProtecao() {
  const corpo = JSON.stringify({ cep: "88010000", itens: [{ id: "1", nome: "cola", quantidade: 1 }] });
  const abertas = [];
  for (const rota of ["buscar", "passe"]) {
    const r = await fetch(`${URL}/api/${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
    await r.body?.cancel();
    console.log(`  /api/${rota} sem Turnstile -> HTTP ${r.status}`);
    if (r.status < 400) abertas.push(rota);
  }
  return abertas;
}

const raiz = path.resolve(import.meta.dirname, "..");
if (saida("git", ["status", "--porcelain"], raiz).trim()) {
  console.error("Há alterações não commitadas. Commite antes de publicar (o deploy sai do HEAD).");
  process.exit(1);
}

const anterior = JSON.parse(saida(netlify, ["api", "getSite", "--data", JSON.stringify({ site_id: SITE_ID })], raiz)).published_deploy?.id;
const pasta = mkdtempSync(path.join(tmpdir(), "kitescola-deploy-"));
console.log(`Cópia limpa em ${pasta} (deploy anterior: ${anterior})`);
try {
  rodar("git", ["worktree", "add", "--detach", pasta, "HEAD"], raiz);
  rodar(npm, ["ci", "--no-audit", "--no-fund"], pasta);
  rodar(netlify, ["deploy", "--build", "--prod", "--site", SITE_ID], pasta);

  const envs = envsEm(path.join(pasta, ".netlify"));
  if (envs.length) throw new Error(`arquivo .env dentro do deploy: ${envs.join(", ")}`);

  console.log("Conferindo a proteção no site no ar...");
  const abertas = await conferirProtecao();
  if (abertas.length) {
    console.error(`PROTEÇÃO ABERTA em ${abertas.join(", ")}. Voltando para o deploy ${anterior}.`);
    if (anterior) rodar(netlify, ["api", "restoreSiteDeploy", "--data", JSON.stringify({ site_id: SITE_ID, deploy_id: anterior })], raiz);
    process.exit(1);
  }
  console.log("Publicado e protegido.");
} finally {
  spawnSync("git", ["worktree", "remove", "--force", pasta], { cwd: raiz, stdio: "inherit", shell: win });
  rmSync(pasta, { recursive: true, force: true });
}
