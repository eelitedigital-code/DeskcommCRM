import "server-only";

import { CHAVE_DA_IA_DA_EMPRESA, iaLigadaNaEmpresa } from "@/lib/organizacao/ia-da-empresa";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ler, mesclar nos DOIS níveis e gravar `settings.ia.enabled`, preservando o
 * resto do jsonb compartilhado (branding, security, llm, capacidades…) — o
 * molde de `definirAiDecideDaEmpresa`. Devolve o estado anterior para a
 * auditoria.
 *
 * NUNCA exportar isto de um arquivo `"use server"`: não confere papel nem
 * organização — as actions da organização e do admin da plataforma conferem
 * antes.
 */
export async function gravarIaDaEmpresa(
  orgId: string,
  ligar: boolean,
): Promise<{ ok: true; anterior: boolean } | { ok: false }> {
  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (erroLeitura || !atual) return { ok: false };
  const settings = (atual.settings ?? {}) as Record<string, unknown>;
  const bloco = (settings[CHAVE_DA_IA_DA_EMPRESA] ?? {}) as Record<string, unknown>;
  const anterior = iaLigadaNaEmpresa(settings);
  const novo = { ...settings, [CHAVE_DA_IA_DA_EMPRESA]: { ...bloco, enabled: ligar } };
  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", orgId);
  if (error) return { ok: false };
  return { ok: true, anterior };
}
