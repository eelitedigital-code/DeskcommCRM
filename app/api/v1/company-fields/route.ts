/**
 * GET /api/v1/company-fields — as definições dos campos próprios da EMPRESA
 * (`organizations.settings.company_fields`). Quem chama: a ficha da empresa.
 * Mesma porta do resto do cadastro B2B: módulo + capacidade `empresas`.
 */
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { camposDaEmpresa } from "@/lib/contacts/campos-do-cliente";
import {
  handleRouteError,
  ok,
  requestIdOf,
  seEmpresasDesligadas,
  seModuloB2bDesligado,
} from "@/lib/crm-b2b/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = requestIdOf(req);
  const desligado = await seModuloB2bDesligado(requestId);
  if (desligado) return desligado;
  const authz = await requireRole("viewer", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  try {
    // A organização vem da sessão (`requireRole`), por isso o admin client.
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("settings")
      .eq("id", authz.org.orgId)
      .maybeSingle();
    if (error) throw error;
    const settings = (data?.settings ?? null) as Record<string, unknown> | null;
    return ok({ fields: camposDaEmpresa(settings) }, { requestId });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}
