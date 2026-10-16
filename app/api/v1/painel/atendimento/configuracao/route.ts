import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * /api/v1/painel/atendimento/configuracao — a régua do Dashboard de
 * Atendimento (Spec 04, D5/D6/D9/D11), em `organizations.settings.painel_atendimento`.
 *
 *   GET   — a configuração em vigor e o padrão. Qualquer membro: a tela
 *           mostra a régua junto do número (um selo sem régua não diz nada).
 *   PATCH — muda parte dela. Gerente ou acima: mudar a régua muda a leitura
 *           de todos os períodos daqui em diante (mesmo piso da régua do
 *           Atrito, /api/v1/metrics/atrito).
 *
 * O horário que conta é o da JANELA DE RESPOSTA de cada número, que já se
 * edita em Conexões (`channel_knobs`); aqui só se liga ou desliga a regra
 * "número com agente de IA no ar conta 24 h".
 *
 * Escrita pelo ADMIN client com filtro explícito de organization_id (com o
 * client de sessão o update casa 0 linhas e responde sucesso). Merge
 * não-destrutivo: as demais chaves de `settings` ficam intactas. Gravar
 * invalida o cache do painel DAQUELA organização.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { invalidarPainelDaOrganizacao } from "@/lib/painel-atendimento/carga";
import {
  aplicarPatch,
  CHAVE_DA_CONFIGURACAO,
  CONFIGURACAO_PADRAO,
  lerConfiguracao,
  patchSchema,
} from "@/lib/painel-atendimento/configuracao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "painel_atendimento" });
  if (!authz.ok) return authz.response;

  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    {
      configuracao: lerConfiguracao((data as { settings?: unknown } | null)?.settings),
      padrao: CONFIGURACAO_PADRAO,
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_atendimento" });
  if (!authz.ok) return authz.response;
  const { org, user } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("validation_failed", t("Corpo inválido."), 422, { requestId });
  }
  const parsed = patchSchema.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_failed", t("Configuração inválida. Confira os minutos e os nomes das origens."), 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const admin = createAdminClient();
  const { data: linha, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  // Leitura que falhou PARA aqui: tratá-la como settings vazio regravaria o
  // jsonb inteiro só com esta chave, apagando a configuração da organização.
  if (erroLeitura || !linha) {
    return fail("internal_error", t("Não foi possível salvar. Tente de novo."), 500, { requestId });
  }
  const settings = ((linha as { settings?: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const atual = lerConfiguracao(settings);
  const proxima = aplicarPatch(atual, parsed.data);
  if (!proxima) {
    return fail(
      "validation_failed",
      t("O tempo de atenção precisa ser maior que o tempo esperado, e cabem até 50 nomes de origem."),
      422,
      { requestId },
    );
  }

  const { error: erroGravacao } = await admin
    .from("organizations")
    .update({ settings: { ...settings, [CHAVE_DA_CONFIGURACAO]: proxima } })
    .eq("id", org.orgId);
  if (erroGravacao) return fail("internal_error", t("Não foi possível salvar. Tente de novo."), 500, { requestId });

  invalidarPainelDaOrganizacao(org.orgId);

  // Mudar a régua muda a leitura histórica do painel: mutação relevante.
  void audit({
    action: "painel_atendimento.configuracao_alterada",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    requestId,
    metadata: { antes: atual, depois: proxima },
  });

  return ok({ configuracao: proxima }, { requestId });
}
