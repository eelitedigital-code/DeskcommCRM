/**
 * /api/v1/painel/atendimento/configuracao — a régua do painel, sem banco.
 *
 * Mede o que é da rota: piso de papel (GET qualquer membro, PATCH gerente+),
 * merge que não apaga o resto de `settings`, recusa de régua torta sem tocar
 * no banco, leitura falha que NÃO vira gravação, audit, e o cache do painel
 * invalidado só para a organização que mudou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { invalidarPainelDaOrganizacao } from "@/lib/painel-atendimento/carga";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/painel-atendimento/carga", () => ({ invalidarPainelDaOrganizacao: vi.fn() }));

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const EU = "11111111-1111-4111-8111-111111111111";

function como(role: "viewer" | "agent" | "manager" | "admin"): void {
  vi.mocked(requireRole).mockImplementation(async (min) => {
    const rank = { viewer: 1, agent: 2, manager: 3, admin: 4 } as const;
    if (rank[role] < rank[min as keyof typeof rank]) {
      return { ok: false, response: fail("forbidden", "Sem permissão.", 403) } as never;
    }
    return { ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG, name: "Org", role } } as never;
  });
}

function banco(settings: Record<string, unknown> | null, erroLeitura: unknown = null) {
  const updates: Array<{ valores: Record<string, unknown>; id: unknown }> = [];
  const client = {
    from() {
      return {
        select() {
          return { eq: () => ({ maybeSingle: async () => ({ data: erroLeitura ? null : { settings }, error: erroLeitura }) }) };
        },
        update(valores: Record<string, unknown>) {
          return {
            eq: async (_col: string, id: unknown) => {
              updates.push({ valores, id });
              return { error: null };
            },
          };
        },
      };
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as never);
  return updates;
}

async function patch(corpo: unknown): Promise<Response> {
  const { PATCH } = await import("./route");
  return PATCH(new NextRequest("http://localhost/api/v1/painel/atendimento/configuracao", {
    method: "PATCH",
    body: JSON.stringify(corpo),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null as never);
});

describe("GET", () => {
  it("qualquer membro lê a régua em vigor e o padrão", async () => {
    como("viewer");
    banco({ painel_atendimento: { conta_24h_com_ia: false } });
    const { GET } = await import("./route");
    const body = (await (await GET()).json()) as { data: { configuracao: { conta_24h_com_ia: boolean }; padrao: unknown } };
    expect(body.data.configuracao.conta_24h_com_ia).toBe(false);
    expect(body.data.padrao).toBeTruthy();
  });
});

describe("PATCH", () => {
  it("atendente não muda a régua", async () => {
    como("agent");
    const updates = banco({});
    expect((await patch({ conta_24h_com_ia: false })).status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("gerente muda parte e o resto de settings fica intacto; audita e invalida só a dele", async () => {
    como("manager");
    const updates = banco({ atrito: { abandono_horas: 48 }, painel_atendimento: { limiares: { espera_limite_min: 20 } } });
    const res = await patch({ conta_24h_com_ia: false, rotulos_de_origem: { Meta: "Anúncios Meta" } });
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe(ORG);
    const gravado = updates[0]?.valores.settings as Record<string, Record<string, unknown>>;
    expect(gravado.atrito).toEqual({ abandono_horas: 48 });
    expect(gravado.painel_atendimento).toEqual({
      conta_24h_com_ia: false,
      limiares: { resposta_esperado_min: 5, resposta_atencao_min: 15, espera_limite_min: 20 },
      rotulos_de_origem: { Meta: "Anúncios Meta" },
    });
    expect(invalidarPainelDaOrganizacao).toHaveBeenCalledWith(ORG);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "painel_atendimento.configuracao_alterada", organizationId: ORG }));
  });

  it("régua torta: 422 sem gravar", async () => {
    como("admin");
    const updates = banco({});
    expect((await patch({ limiares: { resposta_esperado_min: 20, resposta_atencao_min: 10 } })).status).toBe(422);
    expect((await patch({ limiares: { espera_limite_min: 0 } })).status).toBe(422);
    expect((await patch({ chave_inventada: 1 })).status).toBe(422);
    expect(updates).toHaveLength(0);
  });

  it("leitura que falhou não vira gravação", async () => {
    como("manager");
    const updates = banco(null, { message: "timeout" });
    expect((await patch({ conta_24h_com_ia: false })).status).toBe(500);
    expect(updates).toHaveLength(0);
    expect(invalidarPainelDaOrganizacao).not.toHaveBeenCalled();
  });

  it("acompanhamento de suporte só leitura é barrado antes de tudo", async () => {
    como("manager");
    const updates = banco({});
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("forbidden_scope", "Somente leitura.", 403) as never);
    expect((await patch({ conta_24h_com_ia: false })).status).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
