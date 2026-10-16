import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * Ler, mesclar e gravar UMA lista de definições de campo em
 * `organizations.settings[chave]`, preservando o resto do jsonb (branding,
 * security, as capacidades…). Devolve a lista anterior para a auditoria.
 *
 * NUNCA exportar isto de um arquivo `"use server"`: não confere papel nem
 * organização — as actions que o chamam conferem antes, e o `orgId` delas vem
 * da sessão.
 */
export async function gravarDefinicoesDeCampos(
  orgId: string,
  chave: string,
  campos: CustomFieldDef[],
): Promise<{ ok: true; anterior: unknown } | { ok: false }> {
  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (erroLeitura || !atual) return { ok: false };
  const settings = (atual.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("organizations")
    .update({ settings: { ...settings, [chave]: campos } })
    .eq("id", orgId);
  if (error) return { ok: false };
  return { ok: true, anterior: settings[chave] ?? [] };
}
