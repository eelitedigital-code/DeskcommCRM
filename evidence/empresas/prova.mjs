// Prova pela tela — Especificação 02: Empresas, equipe e painel de vendas.
// Roda contra a CÓPIA PRIVADA (http://localhost:3999) com 2 organizações de teste.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3999";
const OUT = "/evidence";
mkdirSync(OUT, { recursive: true });

const cred = Object.fromEntries(
  readFileSync("/teste/credenciais", "utf8").trim().split("\n").map((l) => {
    const [L, email, senha] = l.split(" ");
    return [L, { email, senha }];
  }),
);
const dados = readFileSync("/teste/dados", "utf8").trim().split("\n").map((l) => l.split("|"));
const idDe = (nome) => dados.find((d) => d[3] === nome)?.[2];

const resultados = [];
function confere(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function entrar(browser, L) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", cred[L].email);
  await page.fill("#password", cred[L].senha);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page };
}

async function adicionarNaEquipe(page, busca, nome, cargo, decide) {
  await page.getByRole("button", { name: "Adicionar à equipe" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.locator("#equipe-busca").fill(busca);
  await dialogo.getByTestId("equipe-resultados").getByRole("button", { name: new RegExp(nome) }).click();
  await dialogo.locator("#equipe-cargo").fill(cargo);
  if (decide) await dialogo.getByLabel("Decide a compra").check();
  await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByText("Adicionado à equipe.").first().waitFor({ timeout: 15000 });
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
}

const browser = await chromium.launch();
let empresaA = null;
try {
  const { ctx: ctxA, page } = await entrar(browser, "A");
  confere("login da organização A", true);

  // ── A.4: DESLIGADO quer dizer sumido ────────────────────────────────────
  const r0 = await ctxA.request.get(`${BASE}/api/v1/companies`);
  confere("DESLIGADO: a rota de empresas responde 403", r0.status() === 403, `HTTP ${r0.status()}`);
  await page.goto(`${BASE}/app/companies`);
  await sleep(1500);
  confere("DESLIGADO: a tela Empresas recusa (403)", page.url().includes("/403"), page.url());
  await page.goto(`${BASE}/app/crm`);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/01-desligado-hub-crm-sem-empresas.png`, fullPage: true });
  confere(
    "DESLIGADO: a porta Empresas some do hub do CRM",
    (await page.locator('a[href="/app/companies"]').count()) === 0,
  );

  // ── A.3: o admin da empresa liga em Configurações › Organização ─────────
  await page.goto(`${BASE}/app/settings/tenant`);
  const interruptor = page.getByRole("switch", { name: "Ligar Empresas" });
  await interruptor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/02-interruptor-desligado.png` });
  await interruptor.click();
  await page.getByText("Empresas ligado.").waitFor({ timeout: 15000 });
  confere("A.3 ligar Empresas pela tela", (await interruptor.getAttribute("aria-checked")) === "true");
  await page.goto(`${BASE}/app/crm`);
  await sleep(1500);
  confere("LIGADO: a porta Empresas aparece no hub do CRM", (await page.locator('a[href="/app/companies"]').count()) > 0);

  // ── B: cadastro só com o nome ───────────────────────────────────────────
  await page.goto(`${BASE}/app/companies`);
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const dialogo = page.getByRole("dialog");
  confere(
    "B botão Criar fica desligado sem nome",
    await dialogo.getByRole("button", { name: "Criar" }).isDisabled(),
  );
  await dialogo.locator("#empresa-nome").fill("Calçados Nova Serrana");
  await sleep(300);
  await page.screenshot({ path: `${OUT}/03-cadastro-so-com-nome.png` });
  await dialogo.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
  const lista = await (await ctxA.request.get(`${BASE}/api/v1/companies`)).json();
  empresaA = lista.data.find((c) => c.trade_name === "Calçados Nova Serrana")?.id;
  confere("B empresa criada só com o nome (sem CNPJ)", Boolean(empresaA), empresaA ?? "não achou");
  const semNome = await ctxA.request.post(`${BASE}/api/v1/companies`, { data: { cnpj: null } });
  confere("B servidor recusa empresa sem nome (422)", semNome.status() === 422, `HTTP ${semNome.status()}`);

  // ── C: equipe ───────────────────────────────────────────────────────────
  await page.goto(`${BASE}/app/companies/${empresaA}`);
  await page.getByTestId("equipe-da-empresa").waitFor({ timeout: 20000 });
  await adicionarNaEquipe(page, "João", "João Silva", "Sócio", true);
  await adicionarNaEquipe(page, "Maria", "Maria Silva", "Sócia", false);
  const equipe = page.getByTestId("equipe-da-empresa");
  await equipe.getByText("Maria Silva").waitFor({ timeout: 15000 });
  confere("C dois contatos na equipe, com cargo", (await equipe.getByText(/Sócio · \*\*\*\*-1234/).count()) === 1);
  confere("C a palavra 'pessoa' não aparece como entidade (D7)", (await equipe.getByText(/^Pessoas?$/).count()) === 0);
  const dup = await ctxA.request.post(`${BASE}/api/v1/companies/${empresaA}/equipe`, {
    data: { contact_id: idDe("João Silva") },
  });
  confere("C duplicata recusada com mensagem legível (409)", dup.status() === 409, `HTTP ${dup.status()} ${(await dup.text()).slice(0, 90)}`);

  // ── D: painel de vendas ─────────────────────────────────────────────────
  const vendas = page.getByTestId("vendas-da-empresa");
  await page.getByTestId("vendas-total").getByText(/25\.000,00/).waitFor({ timeout: 15000 });
  await sleep(600);
  await page.screenshot({ path: `${OUT}/04-ficha-equipe-e-vendas.png`, fullPage: true });
  confere("D total comprado = R$ 25.000,00", true, await page.getByTestId("vendas-total").innerText());
  confere("D 2 ganhos", /2 ganhos/.test(await page.getByTestId("vendas-contagem").innerText()), await page.getByTestId("vendas-contagem").innerText());
  confere("D lista com nome · cargo · final do número", (await vendas.getByText(/João Silva/).count()) >= 1 && (await vendas.getByText(/Sócio · \*\*\*\*-1234/).count()) >= 1);

  // Maria sai da empresa: o nome some, a venda fica
  await equipe.locator("li", { hasText: "Maria Silva" }).getByRole("button", { name: "Marcar como saiu da empresa" }).click();
  await sleep(400);
  await page.screenshot({ path: `${OUT}/05-confirmar-saida.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Marcar como saiu" }).click();
  await page.getByText("Marcado como saiu da empresa.").waitFor({ timeout: 15000 });
  await vendas.getByText(/saiu da empresa/).waitFor({ timeout: 15000 });
  await sleep(600);
  await page.screenshot({ path: `${OUT}/06-depois-da-saida.png`, fullPage: true });
  confere("D3 quem saiu: sem nome, com cargo e final do número", (await vendas.getByText(/Sócia · \*\*\*\*-9876/).count()) === 1 && (await vendas.getByText("Maria Silva").count()) === 0);
  confere("D3 a venda de quem saiu continua no total", /25\.000,00/.test(await page.getByTestId("vendas-total").innerText()));
  confere("D3 equipe: 1 · 1 saiu", /1\s*·\s*1 saiu/.test(await page.getByTestId("vendas-equipe").innerText()), await page.getByTestId("vendas-equipe").innerText());
  confere("D3 o nome de quem saiu também some da equipe", (await equipe.getByText("Maria Silva").count()) === 0);

  // ── B.1: link da loja na empresa ────────────────────────────────────────
  const cartao = page.getByTestId("dados-da-empresa");
  await cartao.getByRole("button", { name: "Editar" }).click();
  await page.locator("#empresa-link-shopee").fill("https://shopee.com.br/calcadosns");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await cartao.getByText("https://shopee.com.br/calcadosns").waitFor({ timeout: 15000 });
  confere("B.1 link da Shopee gravado na empresa", true);

  // ── C: do lado do contato ───────────────────────────────────────────────
  await page.goto(`${BASE}/app/contacts/${idDe("João Silva")}`);
  const doContato = page.getByTestId("empresa-do-contato");
  await doContato.waitFor({ timeout: 20000 });
  await sleep(500);
  await page.screenshot({ path: `${OUT}/07-contato-mostra-empresa.png`, fullPage: true });
  confere("C a ficha do contato mostra empresa e cargo", /Calçados Nova Serrana[\s\S]*Sócio/.test(await doContato.innerText()));
  const contatoDB = await (await ctxA.request.get(`${BASE}/api/v1/contacts/${idDe("João Silva")}`)).json();
  confere("D4 o link da empresa NÃO foi copiado para o contato", !JSON.stringify(contatoDB.data.custom_fields ?? {}).includes("shopee"));

  // ── Isolamento A → B ────────────────────────────────────────────────────
  const empresaB = idDe("Empresa Secreta B");
  for (const caminho of [`/api/v1/companies/${empresaB}`, `/api/v1/companies/${empresaB}/equipe`, `/api/v1/companies/${empresaB}/vendas`]) {
    const r = await ctxA.request.get(`${BASE}${caminho}`);
    const corpo = await r.text();
    confere(`ISOLAMENTO A→B ${caminho.replace(empresaB, "<B>")} → 404 sem dado`, r.status() === 404 && !/Secret|99999/.test(corpo), `HTTP ${r.status()}`);
  }
  await ctxA.close();

  // ── Isolamento B → A ────────────────────────────────────────────────────
  const { ctx: ctxB, page: pageB } = await entrar(browser, "B");
  for (const caminho of [`/api/v1/companies/${empresaA}`, `/api/v1/companies/${empresaA}/equipe`, `/api/v1/companies/${empresaA}/vendas`]) {
    const r = await ctxB.request.get(`${BASE}${caminho}`);
    const corpo = await r.text();
    confere(`ISOLAMENTO B→A ${caminho.replace(empresaA, "<A>")} → 404 sem dado`, r.status() === 404 && !/João|Maria|25000/.test(corpo), `HTTP ${r.status()}`);
  }
  const listaB = await (await ctxB.request.get(`${BASE}/api/v1/companies`)).json();
  confere("ISOLAMENTO B lista só a própria empresa", listaB.data.length === 1 && listaB.data[0].trade_name === "Empresa Secreta B");
  await pageB.goto(`${BASE}/app/companies/${empresaB}`);
  await pageB.getByTestId("vendas-total").getByText(/99\.999,00/).waitFor({ timeout: 20000 });
  await sleep(500);
  await pageB.screenshot({ path: `${OUT}/08-organizacao-B-so-ve-a-sua.png`, fullPage: true });
  confere("ISOLAMENTO B vê só o próprio total (R$ 99.999,00)", true);
  await ctxB.close();
} catch (e) {
  confere("roteiro terminou sem erro", false, String(e?.message ?? e).slice(0, 400));
} finally {
  await browser.close();
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(resultados, null, 2));
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} conferências OK`);
  process.exit(falhas ? 1 : 0);
}
