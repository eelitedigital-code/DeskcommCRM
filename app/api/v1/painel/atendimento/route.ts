/**
 * GET /api/v1/painel/atendimento — o Dashboard de Atendimento (Spec 04, fork Elite).
 *
 * Uma rota só de leitura (§7). A conta inteira é da função
 * `fn_painel_atendimento` (migration 9003): o navegador nunca recebe mensagem
 * bruta, só números e séries agregadas (D3).
 *
 * - **Organização:** a ativa da sessão (`requireRole`), passada EXPLÍCITA à
 *   função. A função é SECURITY DEFINER e só o service_role a executa: a
 *   régua de "quem vê o quê" mora aqui, não na RLS de quem pergunta — se
 *   morasse na RLS, o atendente que só enxerga as próprias conversas veria
 *   "os totais da empresa" como os dele (D2).
 * - **Quem vê o quê (D2):** todo nível vê os totais e a quebra por número;
 *   "Por atendente" inteiro só para gerente+, os demais levam a própria linha;
 *   "Canal com mais leads" só para gerente+. Atendente não filtra por colega.
 * - **IA desligada (D7):** some o bloco IA x Pessoa e a linha da IA.
 * - **Custo (D4):** cache curto compartilhado por organização + filtros +
 *   nível (`lib/painel-atendimento/carga.ts`), com consulta única em voo;
 *   limite de taxa por pessoa.
 *
 * Read-only ⇒ sem audit.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { cacheDoPainel, carregarPainel } from "@/lib/painel-atendimento/carga";
import { montarPainel } from "@/lib/painel-atendimento/montar";
import { janelaDoPeriodo, PERIODOS } from "@/lib/painel-atendimento/periodo";

export const dynamic = "force-dynamic";

/** Pedidos por pessoa por minuto: a tela pede a cada 30–60 s; isto é folga para abas e filtros. */
const PEDIDOS_POR_MINUTO = 60;

const querySchema = z.object({
  periodo: z.enum(PERIODOS).default("30d"),
  de: z.string().datetime({ offset: true }).optional(),
  ate: z.string().datetime({ offset: true }).optional(),
  numero: z.string().uuid().optional(),
  atendente: z.string().uuid().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // D2: todo nível vê o painel; o recorte por papel é feito abaixo.
  const authz = await requireRole("viewer", { requestId, resource: "painel_atendimento" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  const taxa = await checkRateLimit(`painel-atendimento:${user.id}`, PEDIDOS_POR_MINUTO, 60);
  if (!taxa.allowed) {
    return fail("rate_limited", t("Muitas atualizações seguidas. Aguarde um instante."), 429, {
      requestId,
      headers: {
        "Retry-After": String(taxa.window_sec),
        "X-RateLimit-Limit": String(taxa.limit),
        "X-RateLimit-Remaining": "0",
      },
    });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    periodo: url.searchParams.get("periodo") ?? undefined,
    de: url.searchParams.get("de") ?? undefined,
    ate: url.searchParams.get("ate") ?? undefined,
    numero: url.searchParams.get("numero") ?? undefined,
    atendente: url.searchParams.get("atendente") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }
  const filtros = parsed.data;

  // O personalizado é validado ANTES do cache: pedido torto não ocupa chave.
  if (filtros.periodo === "personalizado") {
    const janela = janelaDoPeriodo("personalizado", { de: filtros.de, ate: filtros.ate });
    if (!janela.ok) {
      return fail("validation_failed", t("Escolha um início e um fim válidos, com até 92 dias."), 422, { requestId });
    }
  }

  const gerente = ROLE_RANK[org.role] >= ROLE_RANK.manager;
  if (!gerente && filtros.atendente && filtros.atendente !== user.id) {
    return fail("forbidden", t("Você só pode filtrar pelos seus próprios atendimentos."), 403, { requestId });
  }

  try {
    const lido = await cacheDoPainel.obter(
      {
        organizationId: org.orgId,
        periodo: filtros.periodo,
        de: filtros.periodo === "personalizado" ? filtros.de : null,
        ate: filtros.periodo === "personalizado" ? filtros.ate : null,
        numero: filtros.numero,
        atendente: filtros.atendente,
        nivel: gerente ? "gerente" : "equipe",
      },
      () => carregarPainel(org.orgId, filtros),
    );
    const painel = montarPainel(lido.valor.bruto, {
      quem: { userId: user.id, gerente },
      iaLigada: lido.valor.iaLigada,
      configuracao: lido.valor.configuracao,
      nomes: lido.valor.nomes,
    });
    return ok(
      {
        ...painel,
        atualizado_em: new Date(lido.criadoEm).toISOString(),
        filtros: { periodo: filtros.periodo, numero: filtros.numero ?? null, atendente: filtros.atendente ?? null },
      },
      { requestId },
    );
  } catch (erro) {
    logger.error("painel_atendimento.falha", {
      organization_id: org.orgId,
      detail: erro instanceof Error ? erro.message : String(erro),
      requestId,
    });
    return fail("internal_error", t("Não foi possível carregar o painel. Tente de novo em instantes."), 500, { requestId });
  }
}
