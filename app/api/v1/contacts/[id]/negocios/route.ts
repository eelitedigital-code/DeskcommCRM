/**
 * GET /api/v1/contacts/[id]/negocios — o lado COMERCIAL do cliente, para o
 * painel "Negócios" da Visão geral da ficha.
 *
 * ─── Por que não o `crm-summary` ─────────────────────────────────────────────
 *
 * O resumo do painel da conversa corta em 3 negócios e não traz `closed_at`
 * nem `lost_reason`. Somar no navegador a partir dele daria "quanto já gastou"
 * errado para todo cliente com mais de 3 negócios.
 *
 * ─── Onde a conta é feita ────────────────────────────────────────────────────
 *
 * Os agregados saem do SERVIDOR, sobre TODOS os negócios do contato (não sobre
 * a página da lista), lidos pela sessão. Não em SQL agregado (`sum()`), por
 * duas razões medidas: as agregações do PostgREST estão desligadas nesta
 * instalação, e uma função no banco seria mudança de schema; o pool SQL direto
 * do agent-engine ignora a RLS, e o total passaria a contar negócios que quem
 * olha não pode ver (`fn_can_view_lead`). Pela sessão, o número é o dos
 * negócios que a pessoa enxerga — o mesmo universo da lista.
 *
 * - "Quanto já gastou" = soma de `value_cents` dos GANHOS, por moeda (somar
 *   moedas diferentes inventa um número — ver `somaPorMoeda`). `orders` fica de
 *   fora de propósito (D3): não há loja integrada em uso, e somar as duas
 *   fontes duplicaria.
 * - Aberto em funil ARQUIVADO não conta como aberto: arquivar o funil não fecha
 *   os negócios, e o `crm-summary` já os tira pelo mesmo motivo. Ganho e
 *   perdido contam sempre — o dinheiro entrou, ou não, de verdade.
 *
 * Contato anonimizado devolve vazio, como as outras leituras do contato.
 * `organization_id` filtrado explicitamente mesmo com RLS.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { decodificarCursor, codificarCursor } from "@/lib/campanhas/schemas";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";

/** Teto da leitura dos agregados — um cliente com mais negócios que isto é dado de outra natureza. */
const TETO_DOS_AGREGADOS = 5000;

const consultaSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

interface LinhaDoAgregado {
  status: "open" | "won" | "lost";
  value_cents: number | null;
  currency: string | null;
  created_at: string;
  crm_pipelines: { is_archived: boolean } | Array<{ is_archived: boolean }> | null;
}

interface LinhaDaLista {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  value_cents: number | null;
  currency: string | null;
  created_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  owner_kind: "user" | "ai" | null;
  owner_user_id: string | null;
  pipeline_id: string;
  crm_pipelines:
    { name: string; is_archived: boolean } | Array<{ name: string; is_archived: boolean }> | null;
  crm_stages: { name: string } | Array<{ name: string }> | null;
}

function umDoEmbed<T>(embed: T | T[] | null): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed;
}

const VAZIO = {
  resumo: {
    total_ganho: [] as Array<{ currency: string; cents: number }>,
    abertos: 0,
    ganhos: 0,
    perdidos: 0,
    cliente_desde: null as string | null,
    ultimo_negocio: null as {
      created_at: string;
      value_cents: number | null;
      currency: string | null;
    } | null,
  },
  negocios: [] as unknown[],
};

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const { id: contactId } = await ctx.params;
  if (!z.string().uuid().safeParse(contactId).success) {
    return fail("validation_failed", "Contato inválido.", 422, { requestId });
  }
  const consulta = consultaSchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!consulta.success) {
    return fail("validation_failed", "Parâmetros inválidos.", 422, { requestId });
  }
  const { limit, cursor } = consulta.data;
  // O cursor vira texto DENTRO do filtro `.or(...)` do PostgREST: só passa no
  // formato exato que esta rota emite (instante ISO + uuid), senão uma vírgula
  // ou um parêntese forjado reescreveria o filtro.
  const posicao = cursor ? decodificarCursor(cursor) : null;
  if (
    cursor &&
    (!posicao ||
      !z.string().datetime({ offset: true }).safeParse(posicao.created_at).success ||
      !z.string().uuid().safeParse(posicao.id).success)
  ) {
    return fail("validation_failed", "Cursor inválido.", 422, { requestId });
  }

  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const supabase = await createClient();
  const { data: contato, error: erroContato } = await supabase
    .from("contacts")
    .select("id, is_anonymized")
    .eq("organization_id", orgId)
    .eq("id", contactId)
    .maybeSingle();
  if (erroContato) return fail("internal_error", erroContato.message, 500, { requestId });
  if (!contato) return fail("not_found", "Contato não encontrado.", 404, { requestId });
  if (contato.is_anonymized) return ok(VAZIO, { requestId, meta: { has_more: false } });

  let lista = supabase
    .from("crm_leads")
    .select(
      "id, title, status, value_cents, currency, created_at, closed_at, lost_reason, owner_kind, owner_user_id, pipeline_id, crm_pipelines!inner(name, is_archived), crm_stages!crm_leads_stage_id_fkey(name)",
    )
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (posicao) {
    lista = lista.or(
      `created_at.lt.${posicao.created_at},and(created_at.eq.${posicao.created_at},id.lt.${posicao.id})`,
    );
  }

  const [agregado, pagina] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("status, value_cents, currency, created_at, crm_pipelines!inner(is_archived)")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(TETO_DOS_AGREGADOS),
    lista,
  ]);
  const falha = agregado.error ?? pagina.error;
  if (falha) return fail("internal_error", falha.message, 500, { requestId });

  const todos = (agregado.data ?? []) as unknown as LinhaDoAgregado[];
  const totalGanho = new Map<string, number>();
  let abertos = 0;
  let ganhos = 0;
  let perdidos = 0;
  let ultimo: LinhaDoAgregado | null = null;
  for (const n of todos) {
    if (n.status === "won") {
      ganhos += 1;
      if (n.value_cents != null) {
        const moeda = n.currency ?? "BRL";
        totalGanho.set(moeda, (totalGanho.get(moeda) ?? 0) + n.value_cents);
      }
    } else if (n.status === "lost") {
      perdidos += 1;
    } else if (!umDoEmbed(n.crm_pipelines)?.is_archived) {
      abertos += 1;
    }
    if (!ultimo || n.created_at >= ultimo.created_at) ultimo = n;
  }

  const linhas = (pagina.data ?? []) as unknown as LinhaDaLista[];
  const temMais = linhas.length > limit;
  const visiveis = temMais ? linhas.slice(0, limit) : linhas;
  const nomes = await nomesDosAtendentes(visiveis.map((l) => l.owner_user_id));
  const ultimaDaPagina = visiveis[visiveis.length - 1];

  return ok(
    {
      resumo: {
        total_ganho: [...totalGanho.entries()].map(([currency, cents]) => ({ currency, cents })),
        abertos,
        ganhos,
        perdidos,
        cliente_desde: todos[0]?.created_at ?? null,
        ultimo_negocio: ultimo
          ? {
              created_at: ultimo.created_at,
              value_cents: ultimo.value_cents,
              currency: ultimo.currency,
            }
          : null,
      },
      negocios: visiveis.map((l) => {
        const funil = umDoEmbed(l.crm_pipelines);
        return {
          id: l.id,
          title: l.title,
          status: l.status,
          value_cents: l.value_cents,
          currency: l.currency,
          created_at: l.created_at,
          closed_at: l.closed_at,
          lost_reason: l.status === "lost" ? l.lost_reason : null,
          pipeline_id: l.pipeline_id,
          funil_nome: funil?.name ?? null,
          funil_arquivado: funil?.is_archived ?? false,
          etapa_nome: umDoEmbed(l.crm_stages)?.name ?? null,
          responsavel:
            l.owner_kind === "ai"
              ? { tipo: "ia" as const, nome: null }
              : l.owner_user_id
                ? { tipo: "pessoa" as const, nome: nomes.get(l.owner_user_id) ?? null }
                : null,
        };
      }),
    },
    {
      requestId,
      meta: {
        cursor:
          temMais && ultimaDaPagina
            ? codificarCursor({ created_at: ultimaDaPagina.created_at, id: ultimaDaPagina.id })
            : undefined,
        has_more: temMais,
      },
    },
  );
}
