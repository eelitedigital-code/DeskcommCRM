import { describe, expect, it, vi } from "vitest";

import { capacidadesDaOrganizacao, capacidadesLigadas } from "./capacidades";

/** Estes casos medem propostas/empresas; a `ia`, ligada por padrão, tem os seus abaixo. */
const semIa = (lista: readonly string[]) => lista.filter((c) => c !== "ia");

describe("capacidade ia — LIGADA por padrão, sem módulo", () => {
  it("ausente, vazio ou lixo: ligada (não muda nada para quem já usa)", () => {
    for (const s of [{}, null, undefined, { ia: {} }, { ia: { enabled: "false" } }, { ia: "off" }]) {
      expect(capacidadesLigadas(s, []), JSON.stringify(s)).toContain("ia");
    }
  });
  it("só o false explícito desliga", () => {
    expect(capacidadesLigadas({ ia: { enabled: false } }, [])).not.toContain("ia");
  });
  it("não depende de módulo da instalação", () => {
    expect(capacidadesLigadas({}, [])).toEqual(["ia"]);
  });
});

describe("capacidadesLigadas — só o booleano true liga", () => {
  it("proposals.enabled === true liga propostas, com o módulo da instalação ligado", () => {
    expect(semIa(capacidadesLigadas({ proposals: { enabled: true } }, ["propostas"]))).toEqual(["propostas"]);
  });
  it("false, ausente, string e lixo: desligado, sem lançar", () => {
    for (const s of [
      { proposals: { enabled: false } },
      { proposals: {} },
      {},
      null,
      undefined,
      "x",
      [],
      { proposals: { enabled: "true" } },
      { proposals: "ligado" },
    ]) {
      expect(semIa(capacidadesLigadas(s, ["propostas"])), JSON.stringify(s)).toEqual([]);
    }
  });
  // Doc 79: com a chave da INSTALAÇÃO desligada, a da empresa não liga nada.
  it("módulo da instalação desligado: a empresa ligada não conta", () => {
    expect(semIa(capacidadesLigadas({ proposals: { enabled: true } }, []))).toEqual([]);
    expect(semIa(capacidadesLigadas({ proposals: { enabled: true } }, ["banco_externo"]))).toEqual([]);
  });
});

describe("capacidade empresas — o cadastro B2B que cada empresa liga para si", () => {
  it("companies.enabled === true liga empresas, com o módulo crm_b2b ligado", () => {
    expect(semIa(capacidadesLigadas({ companies: { enabled: true } }, ["crm_b2b"]))).toEqual(["empresas"]);
  });
  it("módulo crm_b2b desligado: a empresa ligada não conta", () => {
    expect(semIa(capacidadesLigadas({ companies: { enabled: true } }, ["propostas"]))).toEqual([]);
  });
  it("as duas capacidades convivem, cada uma com o seu módulo", () => {
    expect(
      semIa(
        capacidadesLigadas(
          { proposals: { enabled: true }, companies: { enabled: true } },
          ["propostas", "crm_b2b"],
        ),
      ),
    ).toEqual(["propostas", "empresas"]);
  });
  it("só true liga — string, ausente e lixo não", () => {
    for (const s of [{ companies: { enabled: "true" } }, { companies: true }, {}]) {
      expect(semIa(capacidadesLigadas(s, ["crm_b2b"])), JSON.stringify(s)).toEqual([]);
    }
  });
});

/** Banco falso das duas leituras: a linha da organização e `platform_config`. */
function dbQueDevolve(
  resultado: { data: unknown; error: unknown } | Error,
  chaves: Array<{ chave: string; valor: string }> = [{ chave: "MODULO_PROPOSTAS", valor: "ligado" }],
) {
  const maybeSingle = vi.fn(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const inFn = vi.fn(async () => ({ data: chaves, error: null }));
  const select = vi.fn(() => ({ eq, in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as never, from, select, eq };
}

describe("capacidadesDaOrganizacao — falha fechada", () => {
  it("lê a linha da própria organização", async () => {
    const { db, from, eq } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null });
    expect(semIa(await capacidadesDaOrganizacao(db, "org-1"))).toEqual(["propostas"]);
    expect(from).toHaveBeenCalledWith("organizations");
    expect(from).toHaveBeenCalledWith("platform_config");
    expect(eq).toHaveBeenCalledWith("id", "org-1");
  });
  it("⭐ empresa ligada, instalação sem a linha MODULO_PROPOSTAS: nenhuma", async () => {
    const { db } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null }, []);
    expect(semIa(await capacidadesDaOrganizacao(db, "org-1"))).toEqual([]);
  });
  it("empresa ligada, instalação com MODULO_PROPOSTAS = desligado: nenhuma", async () => {
    const { db } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null }, [
      { chave: "MODULO_PROPOSTAS", valor: "desligado" },
    ]);
    expect(semIa(await capacidadesDaOrganizacao(db, "org-1"))).toEqual([]);
  });
  it("erro do banco = nenhuma capacidade", async () => {
    const { db } = dbQueDevolve({ data: null, error: { message: "boom" } });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
  it("exceção = nenhuma capacidade, sem relançar", async () => {
    const { db } = dbQueDevolve(new Error("rede"));
    await expect(capacidadesDaOrganizacao(db, "org-1")).resolves.toEqual([]);
  });
  it("organização inexistente = nenhuma", async () => {
    const { db } = dbQueDevolve({ data: null, error: null });
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
});
