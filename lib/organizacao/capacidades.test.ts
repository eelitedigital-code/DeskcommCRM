import { describe, expect, it, vi } from "vitest";

import { capacidadesDaOrganizacao, capacidadesLigadas } from "./capacidades";

describe("capacidadesLigadas — só o booleano true liga", () => {
  it("proposals.enabled === true liga propostas, com o módulo da instalação ligado", () => {
    expect(capacidadesLigadas({ proposals: { enabled: true } }, ["propostas"])).toEqual(["propostas"]);
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
      expect(capacidadesLigadas(s, ["propostas"]), JSON.stringify(s)).toEqual([]);
    }
  });
  // Doc 79: com a chave da INSTALAÇÃO desligada, a da empresa não liga nada.
  it("módulo da instalação desligado: a empresa ligada não conta", () => {
    expect(capacidadesLigadas({ proposals: { enabled: true } }, [])).toEqual([]);
    expect(capacidadesLigadas({ proposals: { enabled: true } }, ["banco_externo"])).toEqual([]);
  });
});

describe("capacidade empresas — o cadastro B2B que cada empresa liga para si", () => {
  it("companies.enabled === true liga empresas, com o módulo crm_b2b ligado", () => {
    expect(capacidadesLigadas({ companies: { enabled: true } }, ["crm_b2b"])).toEqual(["empresas"]);
  });
  it("módulo crm_b2b desligado: a empresa ligada não conta", () => {
    expect(capacidadesLigadas({ companies: { enabled: true } }, ["propostas"])).toEqual([]);
  });
  it("as duas capacidades convivem, cada uma com o seu módulo", () => {
    expect(
      capacidadesLigadas(
        { proposals: { enabled: true }, companies: { enabled: true } },
        ["propostas", "crm_b2b"],
      ),
    ).toEqual(["propostas", "empresas"]);
  });
  it("só true liga — string, ausente e lixo não", () => {
    for (const s of [{ companies: { enabled: "true" } }, { companies: true }, {}]) {
      expect(capacidadesLigadas(s, ["crm_b2b"]), JSON.stringify(s)).toEqual([]);
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
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual(["propostas"]);
    expect(from).toHaveBeenCalledWith("organizations");
    expect(from).toHaveBeenCalledWith("platform_config");
    expect(eq).toHaveBeenCalledWith("id", "org-1");
  });
  it("⭐ empresa ligada, instalação sem a linha MODULO_PROPOSTAS: nenhuma", async () => {
    const { db } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null }, []);
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
  });
  it("empresa ligada, instalação com MODULO_PROPOSTAS = desligado: nenhuma", async () => {
    const { db } = dbQueDevolve({ data: { settings: { proposals: { enabled: true } } }, error: null }, [
      { chave: "MODULO_PROPOSTAS", valor: "desligado" },
    ]);
    expect(await capacidadesDaOrganizacao(db, "org-1")).toEqual([]);
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
