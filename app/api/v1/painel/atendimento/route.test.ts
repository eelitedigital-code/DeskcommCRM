/**
 * GET /api/v1/painel/atendimento — a rota, sem banco.
 *
 * A conta é da função SQL (provada em tests/invariants/painel-atendimento).
 * Aqui se mede o que é DA ROTA: organização da sessão, o recorte por papel
 * (D2), o filtro de colega recusado, a validação, o limite de taxa e o custo —
 * dez pedidos ao mesmo tempo viram UMA carga, e outra organização nunca
 * aproveita a carga de ninguém (D4, §7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import type { AuthUser } from "@/lib/auth/types";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { CONFIGURACAO_PADRAO } from "@/lib/painel-atendimento/configuracao";
import { cacheDoPainel, carregarPainel, type CargaDoPainel } from "@/lib/painel-atendimento/carga";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/painel-atendimento/carga", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, carregarPainel: vi.fn() };
});

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const EU = "11111111-1111-4111-8111-111111111111";
const COLEGA = "22222222-2222-4222-8222-222222222222";

function usuario(): AuthUser {
  return { id: EU, email: "eu@example.com", idioma: "pt-BR", is_platform_admin: false } as AuthUser;
}

function como(role: "viewer" | "agent" | "manager" | "admin", orgId = ORG_A): void {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: usuario(),
    org: { orgId, name: "Org", role },
  } as never);
}

function carga(): CargaDoPainel {
  return {
    iaLigada: true,
    configuracao: CONFIGURACAO_PADRAO,
    nomes: new Map([[EU, "Eu"], [COLEGA, "Colega"]]),
    bruto: {
      periodo: { de: "2026-07-01T00:00:00Z", ate: "2026-07-31T00:00:00Z", de_anterior: "2026-06-01T00:00:00Z", fuso: "America/Sao_Paulo" },
      volume: { recebidas: 3, enviadas: 2, enviadas_por: { ia: 1, humano: 1, automacao: 0, sistema: 0, crm: 0 }, anterior: { recebidas: 0, enviadas: 0 } },
      resposta: {
        pares: 2, media_s: 60, mediana_s: 60, sem_resposta: 0,
        ia: { pares: 1, media_s: 10, mediana_s: 10 }, humano: { pares: 1, media_s: 110, mediana_s: 110 },
        por_regra: { janela: 0, sem_janela: 2, "24h_ia": 0 }, anterior: { pares: 0, media_s: null, mediana_s: null },
      },
      primeira_resposta: { conversas: 1, media_s: 110 },
      agora: { ativas: 1, aguardando: 0, acima_do_limite: 0, ate_5_min: 0, de_5_a_15_min: 0, acima_de_15_min: 0 },
      por_hora: [], por_dia: [], por_numero: [],
      por_atendente: [
        { quem: "humano", user_id: EU, enviadas: 1, pares: 1, media_s: 110, mediana_s: 110, aguardando: 0 },
        { quem: "humano", user_id: COLEGA, enviadas: 0, pares: 0, media_s: null, mediana_s: null, aguardando: 0 },
      ],
      ia: { enviadas: 1, pares: 1, media_s: 10, mediana_s: 10, aguardando: 0 },
      origens: [{ origem: "whatsapp", atual: 1, anterior: 0 }],
    },
  };
}

async function chamar(qs = ""): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/painel/atendimento${qs}`));
}

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(carregarPainel).mockReset();
  vi.mocked(carregarPainel).mockImplementation(async () => carga());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1, limit: 60, window_sec: 60 });
  cacheDoPainel.invalidarOrganizacao(ORG_A);
  cacheDoPainel.invalidarOrganizacao(ORG_B);
});

describe("quem vê o quê (D2)", () => {
  it("gerente leva todos os atendentes e o canal com mais leads", async () => {
    como("manager");
    const body = (await (await chamar()).json()) as { data: Record<string, unknown> };
    const linhas = body.data.por_atendente as Array<{ user_id: string | null }>;
    expect(linhas.map((l) => l.user_id)).toEqual([EU, COLEGA, null]);
    expect(body.data.canais_de_leads).not.toBeNull();
  });

  it("atendente leva os totais e só a própria linha; sem canal com mais leads", async () => {
    como("agent");
    const res = await chamar();
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain(COLEGA);
    const body = JSON.parse(texto) as { data: Record<string, unknown> };
    expect((body.data.cartoes as { mensagens: { recebidas: number } }).mensagens.recebidas).toBe(3);
    expect(body.data.canais_de_leads).toBeNull();
  });

  it("atendente não filtra por colega", async () => {
    como("agent");
    const res = await chamar(`?atendente=${COLEGA}`);
    expect(res.status).toBe(403);
    expect(carregarPainel).not.toHaveBeenCalled();
  });

  it("a organização da carga é a da sessão", async () => {
    como("viewer", ORG_B);
    await chamar("?periodo=7d");
    expect(vi.mocked(carregarPainel).mock.calls[0]?.[0]).toBe(ORG_B);
  });
});

describe("validação e limite de taxa", () => {
  it("personalizado sem datas ou longo demais: 422 sem carga", async () => {
    como("manager");
    expect((await chamar("?periodo=personalizado")).status).toBe(422);
    expect((await chamar("?periodo=personalizado&de=2026-01-01T00:00:00Z&ate=2026-07-01T00:00:00Z")).status).toBe(422);
    expect((await chamar("?periodo=ontem")).status).toBe(422);
    expect((await chamar("?numero=nao-e-uuid")).status).toBe(422);
    expect(carregarPainel).not.toHaveBeenCalled();
  });

  it("acima do limite: 429 com Retry-After", async () => {
    como("manager");
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, count: 61, limit: 60, window_sec: 60 });
    const res = await chamar();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(carregarPainel).not.toHaveBeenCalled();
  });
});

describe("custo (D4) e isolamento do cache (§7)", () => {
  it("dez pedidos ao mesmo tempo da mesma empresa: UMA carga", async () => {
    como("manager");
    let liberar: () => void = () => {};
    vi.mocked(carregarPainel).mockImplementation(
      () => new Promise((resolve) => { liberar = () => resolve(carga()); }),
    );
    const pedidos = Array.from({ length: 10 }, () => chamar("?periodo=hoje"));
    await vi.waitFor(() => expect(carregarPainel).toHaveBeenCalledTimes(1));
    liberar();
    const respostas = await Promise.all(pedidos);
    expect(respostas.every((r) => r.status === 200)).toBe(true);
    expect(carregarPainel).toHaveBeenCalledTimes(1);
  });

  it("outra organização não aproveita a carga de ninguém", async () => {
    como("manager", ORG_A);
    await chamar();
    como("manager", ORG_B);
    await chamar();
    expect(vi.mocked(carregarPainel).mock.calls.map((c) => c[0])).toEqual([ORG_A, ORG_B]);
  });

  it("falha na carga vira 500 sem detalhe do banco", async () => {
    como("manager");
    vi.mocked(carregarPainel).mockRejectedValue(new Error("relation does not exist"));
    const res = await chamar();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("relation");
  });
});
