"use server";

/**
 * O admin da PLATAFORMA liga ou desliga a IA de uma organização — o mesmo
 * interruptor que o admin da empresa tem em Configurações › Organização.
 * Gate `requirePlatformAdminEscrita` (scope `full`, sem dívida de MFA), como
 * toda escrita de admin; o id vem do argumento porque o admin da plataforma
 * age SOBRE qualquer tenant — validado como uuid, e a linha precisa existir.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import { gravarIaDaEmpresa } from "@/lib/organizacao/gravar-ia";

const entradaSchema = z.object({ orgId: z.string().uuid(), ligar: z.boolean() });

export type ResultadoIaDoTenant =
  | { ok: true }
  | { ok: false; error: "validation_failed" | "erro_ao_gravar" | string };

export async function definirIaDoTenant(orgId: string, ligar: boolean): Promise<ResultadoIaDoTenant> {
  const entrada = entradaSchema.safeParse({ orgId, ligar });
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user } = escrita.ctx;

  const r = await gravarIaDaEmpresa(entrada.data.orgId, entrada.data.ligar);
  if (!r.ok) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.ia_da_empresa_updated",
    actorUserId: user.id,
    organizationId: entrada.data.orgId,
    resourceType: "organization",
    resourceId: entrada.data.orgId,
    metadata: { de: r.anterior, para: entrada.data.ligar, por: "admin_da_plataforma" },
  });

  revalidatePath(`/admin/tenants/${entrada.data.orgId}`);
  return { ok: true };
}
