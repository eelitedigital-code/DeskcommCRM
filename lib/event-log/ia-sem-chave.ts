/**
 * IA LIGADA SEM CHAVE NÃO É FALHA GRAVE — é falta de configuração.
 *
 * Antes, a organização com a IA ligada e nenhuma credencial utilizável recebia,
 * a cada foto ou áudio de cliente, o aviso CRÍTICO "Uma tarefa automática parou
 * de tentar" (o evento morria depois de 5 tentativas) e mais o de mídia não
 * lida — e, a cada turno de IA, um `job_dead` crítico, sem dedupe nenhum.
 * Medido numa VPS em produção em 15/10/2026: os dois avisos abertos diziam, no
 * detalhe técnico, a mesma frase de `LlmNotConfiguredError`. Para quem não
 * contratou IA, era barulho com etiqueta vermelha.
 *
 * O que muda: o motivo "não há chave" é reconhecido (`ehFaltaDeChaveDeIa`) e,
 * nos três caminhos que desistem por ele (derivação de mídia, despacho do
 * agente e o job do turno), em vez do aviso crítico abre-se NO MÁXIMO UM aviso
 * de ATENÇÃO por organização, com texto de configuração.
 *
 * ═══ POR QUE `event_dead` COM TÍTULO FIXO ═══
 *
 * Sem `kind` novo: `agent_inbox_items.kind` tem CHECK, e um kind novo pediria
 * migration, apêndice, rótulo pt/es e política de destino. O `event_dead` já tem
 * o índice único parcial `agent_inbox_event_dead_aberto_unico`
 * (organization_id, kind, title) enquanto aberto — com o título fixo abaixo, o
 * BANCO garante um só aviso aberto por organização, em qualquer corrida entre
 * workers. O dreno de handlers exclui este título do seu dedupe genérico (ver
 * `avisarEventoMorto`), como já exclui o da IA que não respondeu.
 *
 * Mudar a redação do título faz o aviso aberto com o texto antigo deixar de
 * deduplicar UMA vez: um aviso a mais, nunca um a menos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DETALHE_TECNICO } from "@/lib/event-log/aviso-de-evento-morto";
import { logger } from "@/lib/logger";

export const KIND_DO_AVISO_IA_SEM_CHAVE = "event_dead";
export const SEVERIDADE_DO_AVISO_IA_SEM_CHAVE = "warn";

export const IA_SEM_CHAVE = {
  titulo: "A IA está ligada, mas sem chave configurada",
  corpo:
    "Enquanto não houver uma chave, o assistente não lê fotos nem áudios e não responde sozinho. " +
    "Cadastre a chave em Agente de IA › Credenciais, ou peça para desligarem a IA desta empresa. " +
    "Este aviso é um só: fotos, áudios e conversas seguintes sem chave não abrem outro enquanto ele estiver aberto.",
} as const;

/** A frase de `LlmNotConfiguredError` (`lib/agent-engine/edge/llm/credentials.ts`). */
const MARCA_DA_FALTA_DE_CHAVE = "org sem credencial LLM utilizável";

/**
 * O erro é "não há chave utilizável"? Pela forma e não pela classe: o erro
 * atravessa camadas (o turno o embrulha, o dreno guarda só a mensagem), e o
 * `name`/mensagem de `LlmNotConfiguredError` são o contrato estável — importar
 * a classe aqui puxaria o pool do agent-engine para o dreno de handlers.
 */
export function ehFaltaDeChaveDeIa(erro: unknown): boolean {
  if (typeof erro === "string") return erro.includes(MARCA_DA_FALTA_DE_CHAVE);
  if (!erro || typeof erro !== "object") return false;
  const { name, message } = erro as { name?: unknown; message?: unknown };
  if (name === "llm_not_configured") return true;
  return typeof message === "string" && message.includes(MARCA_DA_FALTA_DE_CHAVE);
}

/** Título e corpo do aviso; o detalhe técnico (a frase crua) vai no fim, rotulado. */
export function avisoDeIaSemChave(detalheTecnico?: string): { title: string; body: string } {
  return {
    title: IA_SEM_CHAVE.titulo,
    body:
      IA_SEM_CHAVE.corpo +
      (detalheTecnico ? ` ${DETALHE_TECNICO} ${detalheTecnico.slice(0, 400)}` : ""),
  };
}

/**
 * Abre o aviso pelo client do Supabase (dreno de handlers, worker de mídia).
 * `23505` é o índice único dizendo "já existe um aberto" — o desfecho que este
 * aviso promete, não falha. Fire-and-forget: nunca derruba quem chama.
 */
export async function avisarIaSemChave(
  admin: SupabaseClient,
  organizationId: string,
  detalheTecnico?: string,
): Promise<void> {
  try {
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: KIND_DO_AVISO_IA_SEM_CHAVE,
      severity: SEVERIDADE_DO_AVISO_IA_SEM_CHAVE,
      ...avisoDeIaSemChave(detalheTecnico),
    });
    if (error && error.code !== "23505") {
      logger.warn("[ia-sem-chave] o banco recusou o aviso", {
        organization_id: organizationId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[ia-sem-chave] não consegui abrir o aviso", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A mesma abertura pelo pool do agent-engine (dreno do despacho e fila de
 * jobs), com o dedupe por `kind_e_titulo` de `insertInboxItem` — o índice
 * único do banco segura a corrida. Importado com `import type` só do contrato,
 * para este módulo não puxar o pool para quem usa o client do Supabase.
 */
export async function avisarIaSemChavePeloPool(
  pool: Pick<import("pg").Pool, "query">,
  organizationId: string,
  detalheTecnico?: string,
): Promise<void> {
  try {
    const { insertInboxItem } = await import("@/lib/agent-engine/db/repository");
    const { title, body } = avisoDeIaSemChave(detalheTecnico);
    await insertInboxItem(
      pool,
      organizationId,
      { kind: KIND_DO_AVISO_IA_SEM_CHAVE, severity: SEVERIDADE_DO_AVISO_IA_SEM_CHAVE, title, body },
      "kind_e_titulo",
    );
  } catch (err) {
    logger.warn("[ia-sem-chave] não consegui abrir o aviso (pool)", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
