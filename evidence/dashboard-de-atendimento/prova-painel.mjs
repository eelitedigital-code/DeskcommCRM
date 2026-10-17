// Prova pela tela — Especificação 04: Dashboard de Atendimento.
// Roda contra a CÓPIA PRIVADA (http://localhost:3999). Chamado por prova.sh,
// uma fase por vez:  node prova.mjs <gerente|menu|atendente|abas|regua|ia-desligada|vazio|org-b>
import { chromium } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3999";
const OUT = "/evidence";
const FASE = process.argv[2];
mkdirSync(OUT, { recursive: true });

const cred = Object.fromEntries(
  readFileSync("/teste/credenciais", "utf8").trim().split("\n").map((l) => {
    const [rotulo, email, senha, id] = l.split(" ");
    return [rotulo, { email, senha, id }];
  }),
);

function confere(nome, ok, detalhe = "") {
  const linha = `${ok ? "OK    " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`;
  console.log(linha);
  appendFileSync(`${OUT}/resultado.txt`, `${linha}\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numero = (s) => Number(String(s ?? "").replace(/\D/g, ""));

async function entrar(browser, rotulo, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", cred[rotulo].email);
  await page.fill("#password", cred[rotulo].senha);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page };
}

async function abrirPainel(page) {
  await page.goto(`${BASE}/app/dashboard`);
  await page.getByTestId("cartao-mensagens").waitFor({ timeout: 30000 });
  await sleep(1500); // gráficos terminam de desenhar
}
const destaque = (page, id) => page.getByTestId(`cartao-${id}`).getByTestId("destaque").innerText();
const texto = (page) => page.locator("main, body").first().innerText();

const browser = await chromium.launch();
try {
  if (FASE === "gerente") {
    const { page } = await entrar(browser, "A-gerente");
    await abrirPainel(page);
    await page.screenshot({ path: `${OUT}/01-gerente.png`, fullPage: true });
    const recebidas = numero(await destaque(page, "mensagens"));
    confere("gerente: Mensagens recebidas (30 dias) bate com o banco", recebidas === Number(process.env.RECEBIDAS_30D), `${recebidas} na tela, ${process.env.RECEBIDAS_30D} no banco`);
    const ativas = numero(await destaque(page, "conversas"));
    confere("gerente: Conversas ativas agora = 4", ativas === 4, String(ativas));
    const espera = numero(await destaque(page, "espera"));
    confere("gerente: Espera acima do limite (15 min) = 1", espera === 1, String(espera));
    const pa = await page.getByTestId("por-atendente").innerText();
    confere("gerente: Por atendente traz os dois atendentes e a IA", pa.includes("Gerente Teste A") && pa.includes("Atendente Teste A") && /\bIA\b/.test(pa));
    confere("gerente: IA x Pessoa aparece", await page.getByTestId("ia-x-pessoa").isVisible());
    const canais = await page.getByTestId("canal-com-mais-leads").innerText();
    confere("gerente: Canal com mais leads aparece, com WhatsApp direto na frente", canais.includes("WhatsApp direto") && canais.includes("Anúncios Meta"));
    const pn = await page.getByTestId("por-numero").innerText();
    confere("gerente: Por número traz a janela 8h–18h e o sem janela", pn.includes("8h–18h") && pn.includes("Sem janela: conta 24 h"));
    const tudo = await texto(page);
    confere("gerente: avisa o número sem janela", tudo.includes("Há número sem janela de resposta configurada"));
    confere("gerente: nada da organização B aparece", !tudo.includes("Número da B") && !tudo.includes("Gerente Teste B"));
    await page.getByTestId("canal-com-mais-leads").screenshot({ path: `${OUT}/01b-canal-com-mais-leads.png` });
  }

  if (FASE === "menu") {
    const { page } = await entrar(browser, "A-gerente", { width: 1280, height: 900 });
    await abrirPainel(page);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação principal"]');
      const r = nav.getBoundingClientRect();
      const hrefs = [...nav.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
      return {
        rola: nav.scrollHeight > Math.round(r.height) + 1,
        altura: Math.round(r.height),
        conteudo: nav.scrollHeight,
        titulosFora: [...nav.querySelectorAll("h2")].filter((h) => h.getBoundingClientRect().bottom > r.bottom).length,
        hrefs,
      };
    });
    await page.screenshot({ path: `${OUT}/02-menu-900px.png` });
    confere("menu em 900 px não rola", !m.rola, `conteúdo ${m.conteudo}px, área ${m.altura}px`);
    confere("menu em 900 px: nenhum grupo fora da dobra", m.titulosFora === 0);
    const iDash = m.hrefs.indexOf("/app/dashboard");
    const iInbox = m.hrefs.indexOf("/app/inbox");
    confere("Dashboard é a primeira porta do Atendimento, acima do Inbox", iDash >= 0 && iDash < iInbox, `${iDash} < ${iInbox}`);
    confere("Radar e Respostas rápidas saíram da barra lateral", !m.hrefs.includes("/app/radar") && !m.hrefs.includes("/app/templates"));
    confere("'Ver tudo em Atendimento' está no menu", m.hrefs.includes("/app/atendimento"));
    await page.goto(`${BASE}/app/atendimento`);
    await sleep(1500);
    const hub = await texto(page);
    await page.screenshot({ path: `${OUT}/03-hub-atendimento.png`, fullPage: true });
    confere("o hub lista Dashboard, Inbox, Radar, Agenda e Respostas rápidas",
      ["Dashboard", "Inbox", "Radar", "Agenda", "Respostas rápidas"].every((x) => hub.includes(x)));
  }

  if (FASE === "atendente") {
    const { ctx, page } = await entrar(browser, "A-atendente");
    await abrirPainel(page);
    await page.screenshot({ path: `${OUT}/04-atendente.png`, fullPage: true });
    const recebidas = numero(await destaque(page, "mensagens"));
    confere("atendente: vê os totais da EMPRESA", recebidas === Number(process.env.RECEBIDAS_30D), `${recebidas}`);
    confere("atendente: não vê o Canal com mais leads", (await page.getByTestId("canal-com-mais-leads").count()) === 0);
    const pa = await page.getByTestId("por-atendente").innerText();
    confere("atendente: Por atendente traz só a própria linha e a da IA", pa.includes("Atendente Teste A") && !pa.includes("Gerente Teste A") && /\bIA\b/.test(pa));
    confere("atendente: o nome do colega não aparece em lugar nenhum", !(await texto(page)).includes("Gerente Teste A"));
    const r = await ctx.request.get(`${BASE}/api/v1/painel/atendimento?atendente=${cred["A-gerente"].id}`);
    confere("atendente: filtrar pelo colega é recusado", r.status() === 403, `HTTP ${r.status()}`);
  }

  if (FASE === "abas") {
    const { ctx } = await entrar(browser, "A-gerente");
    const abas = await Promise.all(Array.from({ length: 10 }, () => ctx.newPage()));
    await Promise.all(abas.map((p) => p.goto(`${BASE}/app/dashboard`)));
    await Promise.all(abas.map((p) => p.getByTestId("cartao-mensagens").waitFor({ timeout: 60000 })));
    confere("10 abas abertas da mesma empresa carregaram o painel", true);
    await abas[0].screenshot({ path: `${OUT}/05-dez-abas.png` });
  }

  if (FASE === "regua") {
    const { page } = await entrar(browser, "A-gerente");
    await abrirPainel(page);
    const antes = await page.getByTestId("cartao-tempo").getAttribute("data-selo");
    await page.getByRole("button", { name: "Ajustar régua" }).click();
    await page.getByLabel("Esperado até (min)").fill("120");
    await page.getByLabel("Atenção até (min)").fill("240");
    await page.screenshot({ path: `${OUT}/06-ajustar-regua.png` });
    await page.getByRole("button", { name: "Salvar" }).click();
    await page.getByText("Régua do painel salva.").first().waitFor({ timeout: 15000 });
    await abrirPainel(page);
    const depois = await page.getByTestId("cartao-tempo").getAttribute("data-selo");
    await page.getByTestId("cartao-tempo").screenshot({ path: `${OUT}/06b-selo-depois.png` });
    confere("a régua nova muda o selo do tempo de resposta", antes !== "esperado" && depois === "esperado", `${antes} → ${depois}`);
  }

  if (FASE === "desligar-ia") {
    const { page } = await entrar(browser, "A-gerente");
    await page.goto(`${BASE}/app/settings/tenant`);
    const sw = page.getByRole("switch", { name: "Ligar a IA" });
    await sw.scrollIntoViewIfNeeded();
    const antes = await sw.getAttribute("aria-checked");
    await sw.click();
    await page.getByText("IA desligada. Nada foi apagado.").first().waitFor({ timeout: 15000 });
    const depois = await sw.getAttribute("aria-checked");
    confere("o admin desliga a IA da empresa pela tela", antes === "true" && depois === "false", `${antes} → ${depois}`);
  }

  if (FASE === "ia-desligada") {
    const { page } = await entrar(browser, "A-gerente");
    await abrirPainel(page);
    await page.screenshot({ path: `${OUT}/07-ia-desligada.png`, fullPage: true });
    confere("IA desligada: o bloco IA x Pessoa some", (await page.getByTestId("ia-x-pessoa").count()) === 0);
    const pa = await page.getByTestId("por-atendente").innerText();
    confere("IA desligada: a linha da IA some de Por atendente", !/\bIA\b/.test(pa));
  }

  if (FASE === "vazio") {
    const { page } = await entrar(browser, "A-gerente");
    await abrirPainel(page);
    await page.getByRole("combobox", { name: "Período" }).click();
    await page.getByRole("option", { name: "Hoje" }).click();
    await page.getByTestId("painel-vazio").waitFor({ timeout: 30000 });
    await page.screenshot({ path: `${OUT}/08-estado-vazio.png`, fullPage: true });
    confere("período sem mensagem mostra o estado vazio", (await page.getByTestId("painel-vazio").innerText()).includes("Nenhuma mensagem neste período"));
  }

  if (FASE === "org-b") {
    const { page } = await entrar(browser, "B-gerente");
    await abrirPainel(page);
    await page.screenshot({ path: `${OUT}/09-organizacao-b.png`, fullPage: true });
    const recebidas = numero(await destaque(page, "mensagens"));
    confere("organização B: só os números dela", recebidas === 1, String(recebidas));
    const canais = await page.getByTestId("canal-com-mais-leads").innerText();
    confere("organização B: só a origem dela no Canal com mais leads", canais.includes("Anúncios Meta") && !canais.includes("WhatsApp direto"));
    const tudo = await texto(page);
    confere("organização B: nada da A aparece", !tudo.includes("Número com janela (teste)") && !tudo.includes("Gerente Teste A"));
  }
} catch (erro) {
  confere(`fase ${FASE} terminou com erro`, false, String(erro?.message ?? erro).split("\n")[0]);
} finally {
  await browser.close();
}
