"use server";

/**
 * O admin da PLATAFORMA liga ou desliga "Empresas" (capacidade `empresas`)
 * para uma organização — o mesmo interruptor que o admin da empresa tem em
 * Configurações › Organização, visto de fora.
 *
 * Gate `requirePlatformAdminEscrita` (via `escritaDeAdminOuRecusa`): scope
 * `full` e sem dívida de MFA, como toda escrita de admin
 * (`tests/unit/admin-escrita-exige-scope-full.test.ts`). O id da organização
 * vem do argumento porque o admin da plataforma age SOBRE qualquer tenant —
 * é o papel dele; ele é validado como uuid e precisa existir.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import { gravarCapacidadeEmpresas } from "@/lib/organizacao/gravar-capacidade";

const entradaSchema = z.object({ orgId: z.string().uuid(), ligar: z.boolean() });

export type ResultadoEmpresasDoTenant =
  { ok: true } | { ok: false; error: "validation_failed" | "erro_ao_gravar" | string };

export async function definirEmpresasDoTenant(
  orgId: string,
  ligar: boolean,
): Promise<ResultadoEmpresasDoTenant> {
  const entrada = entradaSchema.safeParse({ orgId, ligar });
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user } = escrita.ctx;

  const r = await gravarCapacidadeEmpresas(entrada.data.orgId, entrada.data.ligar);
  if (!r.ok) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.capacidade_empresas_updated",
    actorUserId: user.id,
    organizationId: entrada.data.orgId,
    resourceType: "organization",
    resourceId: entrada.data.orgId,
    metadata: { de: r.anterior, para: entrada.data.ligar, por: "admin_da_plataforma" },
  });

  revalidatePath(`/admin/tenants/${entrada.data.orgId}`);
  return { ok: true };
}
