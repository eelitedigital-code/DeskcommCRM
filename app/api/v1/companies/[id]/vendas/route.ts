/**
 * GET /api/v1/companies/[id]/vendas — o PAINEL DE VENDAS da empresa: o que
 * todas as pessoas da equipe fecharam, inclusive quem saiu e quem foi
 * anonimizado (`lib/crm-b2b/equipe.ts`). Lido pela sessão: a RLS de cada
 * tabela vale, e o total é o dos negócios que quem olha pode ver.
 */
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { vendasDaEmpresaHandler } from "@/lib/crm-b2b/equipe";
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
  const authz = await requireRole("viewer", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  const { id } = await params;
  try {
    const supabase = await createClient();
    return ok(await vendasDaEmpresaHandler(supabase, ctxFromAuthz(authz, requestId), id), {
      requestId,
    });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}
