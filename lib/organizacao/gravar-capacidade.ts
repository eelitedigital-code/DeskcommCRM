import "server-only";

import { CHAVE_DA_CAPACIDADE } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * NUNCA exportar isto de um arquivo `"use server"`: lá toda função exportada
 * vira endpoint público, e esta não confere papel nem organização — quem chama
 * (as actions da organização e do admin da plataforma) confere antes.
 *
 * Ler, mesclar e gravar `settings.companies.enabled`, preservando o resto do
 * jsonb compartilhado. Usada também pelo admin da plataforma
 * (`definirEmpresasDoTenant`), que confere o próprio papel antes.
 */
export async function gravarCapacidadeEmpresas(
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

  const chave = CHAVE_DA_CAPACIDADE.empresas;
  const settings = (atual.settings ?? {}) as Record<string, unknown>;
  const bloco = (settings[chave] ?? {}) as Record<string, unknown>;
  const anterior = bloco.enabled === true;
  const novo = { ...settings, [chave]: { ...bloco, enabled: ligar } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", orgId);
  if (error) return { ok: false };
  return { ok: true, anterior };
}
