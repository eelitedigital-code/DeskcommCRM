/**
 * PATCH /api/v1/companies/[id]/equipe/[vinculoId] — cargo, marcas, e SAIR ou
 * VOLTAR da equipe. Sair NÃO apaga: grava `saiu_em` e a venda continua contando
 * para a empresa (`lib/crm-b2b/equipe.ts`). Não há DELETE de propósito.
 */
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { atualizarMembroHandler } from "@/lib/crm-b2b/equipe";
import {
  ctxFromAuthz,
  handleRouteError,
  ok,
  requestIdOf,
  seEmpresasDesligadas,
  seModuloB2bDesligado,
} from "@/lib/crm-b2b/route-helpers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; vinculoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = requestIdOf(req);
  const desligado = await seModuloB2bDesligado(requestId);
  if (desligado) return desligado;
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("manager", { requestId, resource: "company_people" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  const { id, vinculoId } = await params;
  try {
    const supabase = await createClient();
    const data = await atualizarMembroHandler(
      supabase,
      ctxFromAuthz(authz, requestId),
      authz.user.id,
      id,
      vinculoId,
      await req.json(),
    );
    return ok(data, { requestId });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}
