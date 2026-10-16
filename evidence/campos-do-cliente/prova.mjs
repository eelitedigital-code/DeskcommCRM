// Prova pela tela: Campos do cliente + painel de Negócios + isolamento entre empresas.
// Roda contra a CÓPIA PRIVADA (http://localhost:3999), com os 2 usuários de teste.
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
const contatos = Object.fromEntries(
  readFileSync("/teste/contatos", "utf8").trim().split("\n").map((l) => {
    const [slug, id] = l.split("|");
    return [slug.endsWith("-a") ? "A" : "B", id];
  }),
);

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

async function fecharAvisos(page) {
  // Avisos de primeiro acesso, se aparecerem, não podem cobrir a tela.
  await page.keyboard.press("Escape").catch(() => {});
}

const browser = await chromium.launch();
try {
  // ── Empresa A ──────────────────────────────────────────────────────────
  const { ctx: ctxA, page } = await entrar(browser, "A");
  confere("login da empresa A", true, page.url());

  // A.3 — tela de configuração
  await page.goto(`${BASE}/app/settings/campos-do-cliente`);
  await page.getByRole("heading", { name: "Campos do cliente" }).waitFor();
  await fecharAvisos(page);
  await page.screenshot({ path: `${OUT}/01-configuracao-vazia.png`, fullPage: true });

  async function novoCampo(i, chave, rotulo, tipo, opcoes) {
    await page.getByRole("button", { name: "Adicionar campo" }).click();
    await page.getByLabel(`Chave do campo ${i}`, { exact: true }).fill(chave);
    await page.getByLabel(`Rótulo do campo ${i}`, { exact: true }).fill(rotulo);
    if (tipo !== "text") {
      await page.getByLabel(`Tipo do campo ${i}`, { exact: true }).click();
      await page.getByRole("option", { name: tipo, exact: true }).click();
    }
    if (opcoes) await page.getByLabel(`Opções do campo ${i}`, { exact: true }).fill(opcoes);
  }
  await novoCampo(1, "cidade", "Cidade", "text");
  await novoCampo(2, "sexo", "Sexo", "select", "Feminino, Masculino, Prefere não dizer");
  await novoCampo(3, "observacoes", "Observações", "textarea");
  await sleep(600);
  await page.screenshot({ path: `${OUT}/02-configuracao-preenchida.png`, fullPage: true });
  await page.getByRole("button", { name: "Salvar campos do cliente" }).click();
  await page.getByText("Campos do cliente salvos.").waitFor({ timeout: 15000 });
  confere("A.3 salvar os campos do cliente", true);

  // Menu: a tela tem porta
  await page.goto(`${BASE}/app/settings`);
  confere(
    "A.3 a tela aparece em Configurações",
    (await page.getByText("Campos do cliente").count()) > 0,
  );

  // B — painel de Negócios
  await page.goto(`${BASE}/app/contacts/${contatos.A}`);
  const painel = page.getByTestId("negocios-do-contato");
  await painel.waitFor({ timeout: 20000 });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/03-ficha-visao-geral.png`, fullPage: true });
  const total = (await page.getByTestId("negocios-total-ganho").innerText()).replace(/\s/g, " ");
  confere("B quanto já gastou = R$ 1.500,00 (só ganhos)", /1\.500,00/.test(total), total);
  const contagem = await page.getByTestId("negocios-contagem").innerText();
  confere("B contagem 1 aberto · 2 ganhos · 1 perdido", /1 aberto · 2 ganhos · 1 perdido/.test(contagem), contagem);
  confere("B lista os 4 negócios", (await page.getByTestId("negocios-lista").locator("li").count()) === 4);
  confere("B perdido mostra o motivo", (await painel.getByText("Motivo:").count()) === 1);
  confere("B motivo com nome legível (Preço)", (await painel.getByText(/Motivo:\s*Preço/).count()) === 1);
  confere("B nada da empresa B aparece", (await page.getByText(/99\.999|Secret/).count()) === 0);

  // A.4 + A.5 — editar: preencher vazio salva direto
  await page.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Cidade", { exact: true }).fill("Recife");
  await dialogo.getByLabel("Observações", { exact: true }).fill("Prefere contato à tarde.");
  await sleep(400);
  await page.screenshot({ path: `${OUT}/04-editar-preenchendo.png` });
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Contato atualizado").waitFor({ timeout: 15000 });
  confere("A.7 preencher campo vazio salva sem confirmação", (await page.getByTestId("confirmar-sobrescrita").count()) === 0);
  await page.getByTestId("dados-do-cliente").getByText("Recife").waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/05-visao-geral-dados-do-cliente.png`, fullPage: true });
  confere("A.5 Visão geral mostra os dados preenchidos", true);
  confere(
    "A.5 campo vazio não ocupa linha",
    (await page.getByTestId("dados-do-cliente").getByText("Sexo").count()) === 0,
  );

  // A.7 — mudar valor existente pede confirmação com de → para
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("dialog").getByLabel("Cidade", { exact: true }).fill("Natal");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  const lista = page.getByTestId("confirmar-sobrescrita");
  await lista.waitFor({ timeout: 10000 });
  const textoConfirma = await lista.innerText();
  await sleep(600);
  await page.screenshot({ path: `${OUT}/06-confirmacao-sobrescrita.png` });
  confere("A.7 confirmação lista Cidade: Recife → Natal", /Cidade:\s*Recife\s*→\s*Natal/.test(textoConfirma), textoConfirma.replace(/\n/g, " "));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText("Contato atualizado").first().waitFor({ timeout: 15000 });
  await page.getByTestId("dados-do-cliente").getByText("Natal").waitFor({ timeout: 15000 });
  confere("A.7 confirmar grava o valor novo", true);

  // A.2 — dossiê do negócio: campo do cliente marcado
  await page.getByTestId("negocios-lista").getByRole("link").first().click();
  const dossie = page.getByTestId("dossie-dados-do-cliente");
  await dossie.waitFor({ timeout: 20000 });
  await dossie.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/07-dossie-dados-do-cliente.png` });
  confere("A.2 dossiê mostra 'vem do cadastro do cliente'", (await dossie.getByText(/Vem do cadastro do cliente/).count()) === 1);
  confere("A.2 dossiê lê o valor do contato", (await dossie.getByLabel("Cidade", { exact: true }).inputValue()) === "Natal");

  // ── Isolamento: A tentando ler B ──────────────────────────────────────────
  const r1 = await ctxA.request.get(`${BASE}/api/v1/contacts/${contatos.B}/negocios`);
  const c1 = await r1.text();
  confere("ISOLAMENTO A→B /negocios devolve 404", r1.status() === 404, `HTTP ${r1.status()}`);
  confere("ISOLAMENTO A→B /negocios sem dado de B", !/99999|Secret/.test(c1));
  const r2 = await ctxA.request.get(`${BASE}/api/v1/contacts/${contatos.B}`);
  confere("ISOLAMENTO A→B ficha do contato não abre", r2.status() === 404 || r2.status() === 403, `HTTP ${r2.status()}`);
  const r3 = await ctxA.request.get(`${BASE}/api/v1/contact-fields`);
  const c3 = await r3.json();
  confere(
    "ISOLAMENTO A /contact-fields traz só os campos de A",
    r3.status() === 200 && c3.data.fields.map((f) => f.key).join(",") === "cidade,sexo,observacoes",
    JSON.stringify(c3.data?.fields?.map((f) => f.key)),
  );
  const r4 = await ctxA.request.get(`${BASE}/api/v1/contacts/${contatos.A}/negocios`);
  const c4 = await r4.json();
  confere("ISOLAMENTO total de A não soma B", c4.data.resumo.total_ganho[0]?.cents === 150000, JSON.stringify(c4.data.resumo.total_ganho));
  // Cursor forjado tentando reescrever o filtro
  const forjado = Buffer.from("2020-01-01T00:00:00Z,organization_id.neq.x|00000000-0000-0000-0000-000000000000").toString("base64url");
  const r5 = await ctxA.request.get(`${BASE}/api/v1/contacts/${contatos.A}/negocios?cursor=${forjado}`);
  confere("ISOLAMENTO cursor forjado é recusado (422)", r5.status() === 422, `HTTP ${r5.status()}`);
  await page.goto(`${BASE}/app/contacts/${contatos.B}`);
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/08-isolamento-A-abre-contato-de-B.png` });
  confere("ISOLAMENTO tela: A abrindo o contato de B não vê nada de B", (await page.getByText(/99\.999|Secret/).count()) === 0);
  await ctxA.close();

  // ── Empresa B ──────────────────────────────────────────────────────────
  const { ctx: ctxB, page: pageB } = await entrar(browser, "B");
  await pageB.goto(`${BASE}/app/contacts/${contatos.B}`);
  await pageB.getByTestId("negocios-do-contato").waitFor({ timeout: 20000 });
  await sleep(800);
  await pageB.screenshot({ path: `${OUT}/09-empresa-B-ficha.png`, fullPage: true });
  const totalB = await pageB.getByTestId("negocios-total-ganho").innerText();
  confere("B vê o próprio total (R$ 99.999,00)", /99\.999,00/.test(totalB), totalB);
  confere("B vê os próprios dados do cliente", (await pageB.getByText("Cidade Secreta B").count()) === 1);
  confere("B não vê nada de A", (await pageB.getByText(/Recife|Natal|Venda 1 \(A\)/).count()) === 0);
  const r6 = await ctxB.request.get(`${BASE}/api/v1/contacts/${contatos.A}/negocios`);
  confere("ISOLAMENTO B→A /negocios devolve 404", r6.status() === 404, `HTTP ${r6.status()}`);
  await ctxB.close();
} catch (e) {
  confere("roteiro terminou sem erro", false, String(e?.message ?? e).slice(0, 300));
} finally {
  await browser.close();
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(resultados, null, 2));
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} conferências OK`);
  process.exit(falhas ? 1 : 0);
}
