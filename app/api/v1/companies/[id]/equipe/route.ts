/**
 * /api/v1/companies/[id]/equipe — a EQUIPE da empresa, em termos de CONTATOS.
 *
 * GET lista os membros já na forma de tela (ativo / saiu / anonimizado — ver
 * `lib/crm-b2b/equipe.ts`). POST adiciona um CONTATO: a pessoa por baixo é
 * resolvida no servidor, reaproveitando os mesmos handlers de
 * `/api/v1/company-people` e `/api/v1/contacts/[id]/person`, numa chamada só
 * (três chamadas soltas do navegador deixariam pessoa órfã quando uma falhasse).
 *
 * Papéis: ler é `viewer`; mexer na equipe é `manager`, o mesmo piso de
 * `/api/v1/company-people`.
 */
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { adicionarAEquipeHandler, listarEquipeHandler } from "@/lib/crm-b2b/equipe";
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

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = requestIdOf(req);
  const desligado = await seModuloB2bDesligado(requestId);
  if (desligado) return desligado;
  const authz = await requireRole("viewer", { requestId, resource: "company_people" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  const { id } = await params;
  try {
    const supabase = await createClient();
    return ok(await listarEquipeHandler(supabase, ctxFromAuthz(authz, requestId), id), {
      requestId,
    });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = requestIdOf(req);
  const desligado = await seModuloB2bDesligado(requestId);
  if (desligado) return desligado;
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("manager", { requestId, resource: "company_people" });
  if (!authz.ok) return authz.response;
  const semEmpresas = await seEmpresasDesligadas(authz, requestId);
  if (semEmpresas) return semEmpresas;
  const { id } = await params;
  try {
    const supabase = await createClient();
    const data = await adicionarAEquipeHandler(
      supabase,
      ctxFromAuthz(authz, requestId),
      authz.user.id,
      id,
      await req.json(),
    );
    return ok(data, { requestId, status: 201 });
  } catch (e) {
    return handleRouteError(e, requestId);
  }
}
