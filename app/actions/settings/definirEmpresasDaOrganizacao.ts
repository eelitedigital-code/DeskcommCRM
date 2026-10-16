"use server";

/**
 * Liga e desliga "Empresas" (cadastro B2B, equipe e painel de vendas da
 * empresa) para a ORGANIZAÇÃO ativa — capacidade `empresas` de
 * `lib/organizacao/capacidades.ts`, gravada em `settings.companies.enabled`.
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL, como
 * `definirAiDecideDaEmpresa`: pelo client de sessão, o UPDATE de um admin de
 * tenant em `organizations` casa ZERO linhas e devolve sucesso. O id vem de
 * `resolveActiveOrg`, nunca de argumento.
 *
 * Desligar não apaga nada: empresas, equipe e vínculos ficam no banco, e
 * religar devolve tudo. Com o módulo `crm_b2b` desligado na instalação, a chave
 * gravada aqui não liga nada (a capacidade soma os dois).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { gravarCapacidadeEmpresas } from "@/lib/organizacao/gravar-capacidade";
import { supportWriteError } from "@/lib/impersonate/support";

export type ResultadoEmpresasDaOrganizacao =
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

export async function definirEmpresasDaOrganizacao(
  ligar: boolean,
): Promise<ResultadoEmpresasDaOrganizacao> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = z.boolean().safeParse(ligar);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  // `admin`: o interruptor mora em Configurações › Organização, que é admin-only —
  // a action e a tela dizem a mesma coisa.
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const ok = await gravarCapacidadeEmpresas(org.orgId, entrada.data);
  if (!ok.ok) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.capacidade_empresas_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { de: ok.anterior, para: entrada.data, por: "organizacao" },
  });

  revalidatePath("/app", "layout");
  return { ok: true };
}
