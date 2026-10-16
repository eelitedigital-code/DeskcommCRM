import { describe, expect, it, vi } from "vitest";

import { CacheDoPainel, chaveDoPainel, type ChaveDoPainel } from "./cache";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

function chave(parcial: Partial<ChaveDoPainel> = {}): ChaveDoPainel {
  return { organizationId: ORG_A, periodo: "30d", nivel: "gerente", ...parcial };
}

describe("CacheDoPainel — uma consulta por janela (D4)", () => {
  it("dez abas ao mesmo tempo fazem UMA consulta", async () => {
    const cache = new CacheDoPainel<number>(45_000);
    const carregar = vi.fn(async () => 42);
    const lidos = await Promise.all(Array.from({ length: 10 }, () => cache.obter(chave(), carregar)));
    expect(carregar).toHaveBeenCalledTimes(1);
    expect(lidos.every((l) => l.valor === 42)).toBe(true);
    expect(lidos.filter((l) => !l.doCache)).toHaveLength(1);
  });

  it("depois da validade consulta de novo", async () => {
    let agora = 1_000;
    const cache = new CacheDoPainel<number>(45_000, () => agora);
    const carregar = vi.fn(async () => agora);
    await cache.obter(chave(), carregar);
    agora += 44_999;
    await cache.obter(chave(), carregar);
    expect(carregar).toHaveBeenCalledTimes(1);
    agora += 2;
    await cache.obter(chave(), carregar);
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it("falha não fica guardada", async () => {
    const cache = new CacheDoPainel<number>(45_000);
    const carregar = vi.fn().mockRejectedValueOnce(new Error("banco fora")).mockResolvedValueOnce(7);
    await expect(cache.obter(chave(), carregar)).rejects.toThrow("banco fora");
    await expect(cache.obter(chave(), carregar)).resolves.toMatchObject({ valor: 7 });
    expect(carregar).toHaveBeenCalledTimes(2);
  });
});

describe("CacheDoPainel — isolamento entre organizações (§7)", () => {
  it("a chave começa pela organização e leva filtros e nível", () => {
    expect(chaveDoPainel(chave())).toMatch(new RegExp(`^${ORG_A}\\|`));
    expect(chaveDoPainel(chave({ nivel: "equipe" }))).not.toBe(chaveDoPainel(chave()));
    expect(chaveDoPainel(chave({ numero: "x" }))).not.toBe(chaveDoPainel(chave()));
    expect(chaveDoPainel(chave({ organizationId: ORG_B }))).not.toBe(chaveDoPainel(chave()));
  });

  it("organizações diferentes nunca dividem resultado", async () => {
    const cache = new CacheDoPainel<string>(45_000);
    const a = await cache.obter(chave(), async () => "dados de A");
    const b = await cache.obter(chave({ organizationId: ORG_B }), async () => "dados de B");
    expect(a.valor).toBe("dados de A");
    expect(b.valor).toBe("dados de B");
    expect(b.doCache).toBe(false);
  });

  it("invalidar uma organização não esvazia a outra", async () => {
    const cache = new CacheDoPainel<string>(45_000);
    await cache.obter(chave(), async () => "A");
    await cache.obter(chave({ organizationId: ORG_B }), async () => "B");
    cache.invalidarOrganizacao(ORG_A);
    const carregarB = vi.fn(async () => "B2");
    const b = await cache.obter(chave({ organizationId: ORG_B }), carregarB);
    expect(b.valor).toBe("B");
    expect(carregarB).not.toHaveBeenCalled();
    const carregarA = vi.fn(async () => "A2");
    expect((await cache.obter(chave(), carregarA)).valor).toBe("A2");
  });
});
