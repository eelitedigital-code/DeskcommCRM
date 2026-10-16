"use server";

/**
 * Liga e desliga o ATENDIMENTO COM IA da empresa inteira
 * (`organizations.settings.ia.enabled`, `lib/organizacao/ia-da-empresa.ts`).
 *
 * Molde de `definirAiDecideDaEmpresa`: service role com `organization_id` da
 * sessão (pelo client de sessão, o UPDATE de um admin de tenant em
 * `organizations` casa ZERO linhas e devolve sucesso), leitura-mescla-escrita,
 * auditoria com de→para.
 *
 * `admin`: o interruptor mora em Configurações › Organização, que é admin-only,
 * e desligar a IA muda o atendimento de todo cliente da empresa.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { gravarIaDaEmpresa } from "@/lib/organizacao/gravar-ia";

export type ResultadoIaDaEmpresa =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function definirIaDaEmpresa(ligar: boolean): Promise<ResultadoIaDaEmpresa> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = z.boolean().safeParse(ligar);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const r = await gravarIaDaEmpresa(org.orgId, entrada.data);
  if (!r.ok) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.ia_da_empresa_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { de: r.anterior, para: entrada.data, por: "organizacao" },
  });

  revalidatePath("/app", "layout");
  return { ok: true };
}
