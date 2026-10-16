"use server";

/**
 * Grava os CAMPOS PRÓPRIOS DA EMPRESA (cadastro B2B) —
 * `organizations.settings.company_fields`. Valores em `companies.custom_fields`.
 *
 * Mesmo desenho de `salvarCamposDoCliente`: `manager`+, organização da sessão,
 * service role com `organization_id` de fonte confiável, lista inteira, chave
 * repetida recusada. Além disso exige a capacidade `empresas` ligada: com ela
 * desligada, nada de empresa se configura (nada é apagado).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  CHAVE_DOS_CAMPOS_DA_EMPRESA,
  MAXIMO_DE_CAMPOS_DO_CLIENTE,
} from "@/lib/contacts/campos-do-cliente";
import { supportWriteError } from "@/lib/impersonate/support";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { gravarDefinicoesDeCampos } from "@/lib/organizacao/gravar-campos";
import { customFieldSchema } from "@/lib/schemas/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const entradaSchema = z
  .array(customFieldSchema)
  .max(MAXIMO_DE_CAMPOS_DO_CLIENTE)
  .refine((campos) => new Set(campos.map((c) => c.key)).size === campos.length, {
    message: "chave_repetida",
  });

export type ResultadoCamposDaEmpresa =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "chave_repetida"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "capacidade_desligada"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function salvarCamposDaEmpresa(campos: unknown): Promise<ResultadoCamposDaEmpresa> {
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
  if (!(await capacidadesDaOrganizacao(createAdminClient(), org.orgId)).includes("empresas")) {
    return { ok: false, error: "capacidade_desligada" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const r = await gravarDefinicoesDeCampos(org.orgId, CHAVE_DOS_CAMPOS_DA_EMPRESA, entrada.data);
  if (!r.ok) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.company_fields_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { de: r.anterior, para: entrada.data },
  });

  revalidatePath("/app/settings/campos-da-empresa");
  return { ok: true };
}
