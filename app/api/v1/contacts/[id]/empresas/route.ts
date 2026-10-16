/**
 * GET /api/v1/contacts/[id]/empresas — as empresas em cuja equipe este contato
 * está (ativo), com o cargo, para a Visão geral da ficha do contato.
 * Contato anonimizado ou sem pessoa: lista vazia.
 */
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { empresasDoContatoHandler } from "@/lib/crm-b2b/equipe";
import {
  ctxFromAuthz,
  handleRouteError,
  ok,
  requestIdOf,
  seEmpresasDesligadas,
  seModuloB2bDesligado,
} from "@/lib/crm-b2b/route-helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = requestIdOf(req);
  const desligado = await seModuloB2bDesligado(requestId);
  if (desligado) return desligado;
  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  const { id } = await params;
  try {
    const supabase = await createClient();
    return ok(await empresasDoContatoHandler(supabase, ctxFromAuthz(authz, requestId), id), {
      requestId,
    });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}
