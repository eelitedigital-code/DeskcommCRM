/**
 * GET /api/v1/contact-fields — as definições dos CAMPOS DO CLIENTE da organização.
 *
 * Quem chama: a ficha do contato (editar e Visão geral), o painel da conversa e
 * o dossiê do negócio (`hooks/contacts/useCamposDoCliente.ts`). Quem grava é a
 * tela Configurações → Campos do cliente, pela action `salvarCamposDoCliente`.
 *
 * `viewer`+: são rótulos e tipos, não dado de cliente — quem pode ler um
 * contato precisa saber o que cada campo dele significa.
 *
 * O id da organização vem do `requireRole` (sessão), nunca da requisição; por
 * isso o admin client pode ler a linha dela — `organizations` pela sessão não é
 * o caminho que o resto das configurações usa.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { camposDoCliente } from "@/lib/contacts/campos-do-cliente";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const settings = (data?.settings ?? null) as Record<string, unknown> | null;
  return ok({ fields: camposDoCliente(settings) }, { requestId });
}
