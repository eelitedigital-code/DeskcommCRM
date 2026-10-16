/**
 * EQUIPE DA EMPRESA e o PAINEL DE VENDAS da empresa.
 *
 * A camada `people` NUNCA aparece na tela (decisão D7 da Especificação 02):
 * quem opera escolhe CONTATOS, e este módulo resolve a pessoa por baixo —
 * usa a de `contacts.person_id` ou cria uma a partir do nome e do e-mail do
 * contato. Os passos reaproveitam os handlers que já existem
 * (`createPersonHandler`, `linkContactToPersonHandler`,
 * `linkCompanyPersonHandler`), cada um com a sua auditoria.
 *
 * A venda entra na conta da empresa SEMPRE pela pessoa (D1): `crm_leads` não
 * tem `company_id`. Caminho: `company_people` (da empresa) → `contacts` (por
 * `person_id`) → `crm_leads` (por `contact_id`), com `organization_id`
 * filtrado em cada passo, lidos pela SESSÃO — a RLS de cada tabela vale, e um
 * negócio que quem olha não pode ver não entra no total.
 *
 * Quem SAIU (`saiu_em`) continua somando, sem nome (cargo + final do número).
 * Quem foi ANONIMIZADO continua somando, sem nome e sem cargo — a anonimização
 * vence (D8), e a 0449 já apagou nome e cargo no banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { audit } from "@/lib/audit";
import {
  createPersonHandler,
  linkCompanyPersonHandler,
  linkContactToPersonHandler,
} from "@/lib/crm-b2b/people-handler";

type SB = SupabaseClient;

function err(ctx: HandlerCtx, status: number, code: string, message: string): never {
  throw new ApiError(status, code, undefined, ctx.requestId, message);
}

/** Teto da leitura: uma empresa com mais vínculos/negócios que isto é outro tipo de dado. */
const TETO = 5000;

export const adicionarAEquipeSchema = z.object({
  contact_id: z.string().uuid(),
  job_title: z.string().trim().max(200).optional().nullable(),
  is_decision_maker: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

export const atualizarMembroSchema = z.object({
  /** true = "Marcar como saiu da empresa" (grava `saiu_em`); false = voltou. */
  saiu: z.boolean().optional(),
  job_title: z.string().trim().max(200).optional().nullable(),
  is_decision_maker: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

async function empresaDaOrganizacao(supabase: SB, ctx: HandlerCtx, companyId: string) {
  if (!z.string().uuid().safeParse(companyId).success)
    err(ctx, 404, "not_found", "Empresa não encontrada.");
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", ctx.organization_id)
    .eq("id", companyId)
    .maybeSingle();
  if (error) err(ctx, 500, "internal_error", error.message);
  if (!data) err(ctx, 404, "not_found", "Empresa não encontrada.");
}

/** Os 4 últimos dígitos do telefone — o que identifica quem saiu sem expor o nome. */
export function finalDoNumero(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

/**
 * Adicionar à equipe: escolhido um CONTATO, resolve a pessoa por baixo e cria o
 * vínculo. Contato anonimizado não entra (a busca já o exclui; aqui é a
 * autoridade). Quem já SAIU e é adicionado de novo volta à equipe (a mesma
 * linha, `saiu_em` limpo) — `unique (company_id, person_id)` não deixa criar a
 * segunda.
 */
export async function adicionarAEquipeHandler(
  supabase: SB,
  ctx: HandlerCtx,
  actorUserId: string,
  companyId: string,
  raw: unknown,
) {
  const body = adicionarAEquipeSchema.parse(raw);
  await empresaDaOrganizacao(supabase, ctx, companyId);

  const { data: contato, error: erroContato } = await supabase
    .from("contacts")
    .select("id, name, display_name, email, phone_number, person_id, is_anonymized")
    .eq("organization_id", ctx.organization_id)
    .eq("id", body.contact_id)
    .maybeSingle();
  if (erroContato) err(ctx, 500, "internal_error", erroContato.message);
  if (!contato) err(ctx, 404, "not_found", "Contato não encontrado.");
  if (contato.is_anonymized) {
    err(ctx, 422, "contato_anonimizado", "Contato anonimizado não entra na equipe.");
  }

  let personId = contato.person_id as string | null;
  if (!personId) {
    const nome =
      (contato.name as string | null)?.trim() ||
      (contato.display_name as string | null)?.trim() ||
      (contato.phone_number as string | null) ||
      "Contato";
    const pessoa = await createPersonHandler(supabase, ctx, actorUserId, {
      full_name: nome,
      email: (contato.email as string | null) || null,
    });
    personId = pessoa.id as string;
    await linkContactToPersonHandler(supabase, ctx, actorUserId, contato.id as string, personId);
  }

  const { data: existente } = await supabase
    .from("company_people")
    .select("id, saiu_em")
    .eq("organization_id", ctx.organization_id)
    .eq("company_id", companyId)
    .eq("person_id", personId)
    .maybeSingle();
  if (existente) {
    if (!existente.saiu_em)
      err(ctx, 409, "ja_na_equipe", "Este contato já está na equipe da empresa.");
    return atualizarMembroHandler(supabase, ctx, actorUserId, companyId, existente.id as string, {
      saiu: false,
      job_title: body.job_title ?? null,
      is_decision_maker: body.is_decision_maker ?? false,
      is_primary: body.is_primary ?? false,
    });
  }

  try {
    return await linkCompanyPersonHandler(supabase, ctx, actorUserId, {
      company_id: companyId,
      person_id: personId,
      job_title: body.job_title || null,
      is_decision_maker: body.is_decision_maker ?? false,
      is_primary: body.is_primary ?? false,
    });
  } catch (e) {
    // Corrida com outro clique: o `unique` do banco é a autoridade.
    if (e instanceof ApiError && e.status === 409) {
      err(ctx, 409, "ja_na_equipe", "Este contato já está na equipe da empresa.");
    }
    throw e;
  }
}

/**
 * Atualizar um membro: cargo, marcas e SAIR/VOLTAR. Sair NÃO apaga a linha —
 * grava `saiu_em` —, porque o vínculo sustenta o histórico de vendas da empresa.
 */
export async function atualizarMembroHandler(
  supabase: SB,
  ctx: HandlerCtx,
  actorUserId: string,
  companyId: string,
  vinculoId: string,
  raw: unknown,
) {
  const body = atualizarMembroSchema.parse(raw);
  if (!z.string().uuid().safeParse(vinculoId).success)
    err(ctx, 404, "not_found", "Membro não encontrado.");
  const patch: Record<string, unknown> = {};
  if (body.saiu !== undefined) patch.saiu_em = body.saiu ? new Date().toISOString() : null;
  if (body.job_title !== undefined) patch.job_title = body.job_title || null;
  if (body.is_decision_maker !== undefined) patch.is_decision_maker = body.is_decision_maker;
  if (body.is_primary !== undefined) patch.is_primary = body.is_primary;
  if (Object.keys(patch).length === 0) err(ctx, 400, "invalid_request", "Nada para atualizar.");

  const { data, error } = await supabase
    .from("company_people")
    .update(patch)
    .eq("organization_id", ctx.organization_id)
    .eq("company_id", companyId)
    .eq("id", vinculoId)
    .select("id, company_id, job_title, is_decision_maker, is_primary, saiu_em")
    .maybeSingle();
  if (error) err(ctx, 500, "internal_error", error.message);
  if (!data) err(ctx, 404, "not_found", "Membro não encontrado.");

  await audit({
    organizationId: ctx.organization_id,
    actorUserId,
    action: "company_people.updated",
    resourceType: "company_people",
    resourceId: vinculoId,
    requestId: ctx.requestId,
    metadata: patch,
  });
  return data;
}

interface Vinculo {
  id: string;
  person_id: string;
  job_title: string | null;
  is_decision_maker: boolean;
  is_primary: boolean;
  saiu_em: string | null;
  created_at: string;
}

interface ContatoDaPessoa {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  person_id: string;
  is_anonymized: boolean;
}

/**
 * Como a pessoa aparece na tela — as TRÊS formas da Especificação 02 (D3 × D8):
 *   ativa        → nome · cargo · final do número
 *   saiu         → cargo · final do número (sem nome)
 *   anonimizada  → nada que identifique (sem nome, sem cargo, sem número)
 * A anonimização vence a saída.
 */
export function identidadeNaTela(
  v: Pick<Vinculo, "job_title" | "saiu_em">,
  contato: ContatoDaPessoa | null,
) {
  if (!contato || contato.is_anonymized) {
    return {
      situacao: "anonimizado" as const,
      nome: null,
      cargo: null,
      final_do_numero: null,
      contact_id: null,
    };
  }
  const nome = contato.name?.trim() || contato.display_name?.trim() || null;
  const final_do_numero = finalDoNumero(contato.phone_number);
  if (v.saiu_em) {
    return {
      situacao: "saiu" as const,
      nome: null,
      cargo: v.job_title,
      final_do_numero,
      contact_id: null,
    };
  }
  return {
    situacao: "ativo" as const,
    nome,
    cargo: v.job_title,
    final_do_numero,
    contact_id: contato.id,
  };
}

/** Os vínculos da empresa e o contato de cada pessoa (o mais antigo, não anonimizado se houver). */
async function equipeComContatos(supabase: SB, ctx: HandlerCtx, companyId: string) {
  const { data: vinculos, error } = await supabase
    .from("company_people")
    .select("id, person_id, job_title, is_decision_maker, is_primary, saiu_em, created_at")
    .eq("organization_id", ctx.organization_id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(TETO);
  if (error) err(ctx, 500, "internal_error", error.message);
  const lista = (vinculos ?? []) as Vinculo[];
  const pessoas = [...new Set(lista.map((v) => v.person_id))];
  const contatosPorPessoa = new Map<string, ContatoDaPessoa[]>();
  if (pessoas.length > 0) {
    const { data: contatos, error: erroContatos } = await supabase
      .from("contacts")
      .select("id, name, display_name, phone_number, person_id, is_anonymized")
      .eq("organization_id", ctx.organization_id)
      .in("person_id", pessoas)
      .order("created_at", { ascending: true })
      .limit(TETO);
    if (erroContatos) err(ctx, 500, "internal_error", erroContatos.message);
    for (const c of (contatos ?? []) as ContatoDaPessoa[]) {
      const atual = contatosPorPessoa.get(c.person_id) ?? [];
      atual.push(c);
      contatosPorPessoa.set(c.person_id, atual);
    }
  }
  const contatoPrincipal = (personId: string): ContatoDaPessoa | null => {
    const todos = contatosPorPessoa.get(personId) ?? [];
    // Qualquer telefone da pessoa anonimizado: a 0449 já redigiu a PESSOA
    // inteira (nome e cargo), então ela aparece anonimizada.
    if (todos.some((c) => c.is_anonymized)) return { ...todos[0]!, is_anonymized: true };
    return todos[0] ?? null;
  };
  return { lista, contatosPorPessoa, contatoPrincipal };
}

/** GET da equipe: uma linha por vínculo, já na forma de tela. */
export async function listarEquipeHandler(supabase: SB, ctx: HandlerCtx, companyId: string) {
  await empresaDaOrganizacao(supabase, ctx, companyId);
  const { lista, contatoPrincipal } = await equipeComContatos(supabase, ctx, companyId);
  return lista.map((v) => ({
    id: v.id,
    is_decision_maker: v.is_decision_maker,
    is_primary: v.is_primary,
    saiu_em: v.saiu_em,
    desde: v.created_at,
    ...identidadeNaTela(v, contatoPrincipal(v.person_id)),
  }));
}

interface LinhaDeNegocio {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  value_cents: number | null;
  currency: string | null;
  created_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  contact_id: string;
  pipeline_id: string;
  crm_pipelines:
    { name: string; is_archived: boolean } | Array<{ name: string; is_archived: boolean }> | null;
  crm_stages: { name: string } | Array<{ name: string }> | null;
}

function umDoEmbed<T>(embed: T | T[] | null): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/**
 * O PAINEL DE VENDAS DA EMPRESA: o que TODAS as pessoas da equipe fecharam,
 * inclusive quem saiu e quem foi anonimizado. Agregados sobre o conjunto
 * inteiro, no servidor (mesma régua do painel de Negócios do contato).
 */
export async function vendasDaEmpresaHandler(supabase: SB, ctx: HandlerCtx, companyId: string) {
  await empresaDaOrganizacao(supabase, ctx, companyId);
  const { lista, contatosPorPessoa } = await equipeComContatos(supabase, ctx, companyId);

  // Cada contato da equipe aponta para o vínculo da pessoa dele.
  const vinculoDaPessoa = new Map(lista.map((v) => [v.person_id, v]));
  const contatoParaVinculo = new Map<string, { vinculo: Vinculo; contato: ContatoDaPessoa }>();
  for (const [personId, contatos] of contatosPorPessoa) {
    const vinculo = vinculoDaPessoa.get(personId);
    if (!vinculo) continue;
    const anonimizada = contatos.some((c) => c.is_anonymized);
    for (const c of contatos) {
      contatoParaVinculo.set(c.id, {
        vinculo,
        contato: anonimizada ? { ...c, is_anonymized: true } : c,
      });
    }
  }

  const ativos = lista.filter((v) => !v.saiu_em).length;
  const equipe = { ativos, sairam: lista.length - ativos };
  const contatoIds = [...contatoParaVinculo.keys()];
  if (contatoIds.length === 0) {
    return {
      resumo: {
        total_comprado: [],
        abertos: 0,
        ganhos: 0,
        perdidos: 0,
        cliente_desde: null,
        equipe,
      },
      negocios: [],
    };
  }

  const { data, error } = await supabase
    .from("crm_leads")
    .select(
      "id, title, status, value_cents, currency, created_at, closed_at, lost_reason, contact_id, pipeline_id, crm_pipelines!inner(name, is_archived), crm_stages!crm_leads_stage_id_fkey(name)",
    )
    .eq("organization_id", ctx.organization_id)
    .in("contact_id", contatoIds)
    .order("created_at", { ascending: false })
    .limit(TETO);
  if (error) err(ctx, 500, "internal_error", error.message);
  const negocios = (data ?? []) as unknown as LinhaDeNegocio[];

  const total = new Map<string, number>();
  let abertos = 0;
  let ganhos = 0;
  let perdidos = 0;
  let desde: string | null = null;
  for (const n of negocios) {
    if (n.status === "won") {
      ganhos += 1;
      if (n.value_cents != null) {
        const moeda = n.currency ?? "BRL";
        total.set(moeda, (total.get(moeda) ?? 0) + n.value_cents);
      }
    } else if (n.status === "lost") {
      perdidos += 1;
    } else if (!umDoEmbed(n.crm_pipelines)?.is_archived) {
      abertos += 1;
    }
    if (!desde || n.created_at < desde) desde = n.created_at;
  }

  return {
    resumo: {
      total_comprado: [...total.entries()].map(([currency, cents]) => ({ currency, cents })),
      abertos,
      ganhos,
      perdidos,
      cliente_desde: desde,
      equipe,
    },
    negocios: negocios.map((n) => {
      const quem = contatoParaVinculo.get(n.contact_id)!;
      const funil = umDoEmbed(n.crm_pipelines);
      const identidade = identidadeNaTela(quem.vinculo, quem.contato);
      if (identidade.situacao === "anonimizado") {
        // LGPD: a venda fica, o resto não sai daqui. O título do negócio pode
        // carregar o nome do titular; valor, situação e data bastam (D8).
        return {
          id: n.id,
          title: null,
          status: n.status,
          value_cents: n.value_cents,
          currency: n.currency,
          created_at: n.created_at,
          closed_at: n.closed_at,
          lost_reason: null,
          pipeline_id: null,
          funil_nome: null,
          etapa_nome: null,
          quem: identidade,
        };
      }
      return {
        id: n.id,
        title: n.title,
        status: n.status,
        value_cents: n.value_cents,
        currency: n.currency,
        created_at: n.created_at,
        closed_at: n.closed_at,
        lost_reason: n.status === "lost" ? n.lost_reason : null,
        pipeline_id: n.pipeline_id,
        funil_nome: funil?.name ?? null,
        etapa_nome: umDoEmbed(n.crm_stages)?.name ?? null,
        quem: identidade,
      };
    }),
  };
}

/**
 * Do lado do CONTATO: as empresas em cuja equipe a pessoa dele está (ativa),
 * com o cargo — para a Visão geral da ficha.
 */
export async function empresasDoContatoHandler(supabase: SB, ctx: HandlerCtx, contactId: string) {
  if (!z.string().uuid().safeParse(contactId).success)
    err(ctx, 404, "not_found", "Contato não encontrado.");
  const { data: contato, error } = await supabase
    .from("contacts")
    .select("id, person_id, is_anonymized")
    .eq("organization_id", ctx.organization_id)
    .eq("id", contactId)
    .maybeSingle();
  if (error) err(ctx, 500, "internal_error", error.message);
  if (!contato) err(ctx, 404, "not_found", "Contato não encontrado.");
  if (contato.is_anonymized || !contato.person_id) return [];

  const { data: vinculos, error: erroVinculos } = await supabase
    .from("company_people")
    .select(
      "id, job_title, is_decision_maker, is_primary, companies!inner(id, trade_name, legal_name)",
    )
    .eq("organization_id", ctx.organization_id)
    .eq("person_id", contato.person_id)
    .is("saiu_em", null)
    .limit(50);
  if (erroVinculos) err(ctx, 500, "internal_error", erroVinculos.message);
  return (vinculos ?? []).map((v) => {
    type Empresa = { id: string; trade_name: string | null; legal_name: string | null };
    const empresa = umDoEmbed(
      (v as unknown as { companies: Empresa | Empresa[] | null }).companies,
    );
    return {
      vinculo_id: v.id as string,
      company_id: empresa?.id ?? null,
      empresa: empresa?.trade_name || empresa?.legal_name || null,
      cargo: (v.job_title as string | null) ?? null,
      is_decision_maker: v.is_decision_maker as boolean,
      is_primary: v.is_primary as boolean,
    };
  });
}
