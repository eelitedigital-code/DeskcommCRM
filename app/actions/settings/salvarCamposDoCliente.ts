"use server";

/**
 * Grava os CAMPOS DO CLIENTE da organização — `organizations.settings.contact_fields`.
 *
 * O que a chave significa está em `lib/contacts/campos-do-cliente.ts`; aqui só
 * a gravação, no molde de `definirAiDecideDaEmpresa`:
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL: pelo client de
 * sessão, o UPDATE de um admin de tenant em `organizations` casa ZERO linhas e
 * devolve sucesso. O id vem de `resolveActiveOrg`, nunca de argumento.
 *
 * `settings` é jsonb compartilhado: ler, mesclar e gravar preserva o que não é
 * nosso — `branding`, `security` e o resto.
 *
 * Gate `manager`+, o mesmo da tela de funis: é configuração, não atendimento.
 *
 * Apagar um campo daqui NÃO apaga valor de contato nenhum: o valor fica em
 * `contacts.custom_fields` e volta a aparecer se o campo for recriado com a
 * mesma chave.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  CHAVE_DOS_CAMPOS_DO_CLIENTE,
  MAXIMO_DE_CAMPOS_DO_CLIENTE,
  camposDoCliente,
} from "@/lib/contacts/campos-do-cliente";
import { supportWriteError } from "@/lib/impersonate/support";
import { customFieldSchema } from "@/lib/schemas/settings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A lista inteira, sempre — a tela grava o que renderizou. Chave repetida é
 * recusada: duas definições para o mesmo `custom_fields[chave]` seriam dois
 * rótulos brigando pelo mesmo valor.
 */
const entradaSchema = z
  .array(customFieldSchema)
  .max(MAXIMO_DE_CAMPOS_DO_CLIENTE)
  .refine((campos) => new Set(campos.map((c) => c.key)).size === campos.length, {
    message: "chave_repetida",
  });

export type ResultadoCamposDoCliente =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "chave_repetida"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function salvarCamposDoCliente(campos: unknown): Promise<ResultadoCamposDoCliente> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = entradaSchema.safeParse(campos);
  if (!entrada.success) {
    const repetida = entrada.error.issues.some((i) => i.message === "chave_repetida");
    return { ok: false, error: repetida ? "chave_repetida" : "validation_failed" };
  }

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const anterior = camposDoCliente(settings);
  // O escopo é do LUGAR, não do que a tela mandou: tudo aqui é do contato.
  const para = entrada.data.map((c) => ({ ...c, escopo: "contato" as const }));
  const novo = { ...settings, [CHAVE_DOS_CAMPOS_DO_CLIENTE]: para };

  const { error } = await admin
    .from("organizations")
    .update({ settings: novo })
    .eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.contact_fields_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { de: anterior, para },
  });

  revalidatePath("/app/settings/campos-do-cliente");
  return { ok: true };
}
