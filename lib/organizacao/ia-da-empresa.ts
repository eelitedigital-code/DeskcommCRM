/**
 * A IA DA EMPRESA — o interruptor do atendimento com IA inteiro, por
 * organização (Especificação 03, L1).
 *
 * Mora em `organizations.settings.ia.enabled`. LIGADO POR PADRÃO, para não
 * mudar nada para quem já usa: só o booleano `false` desliga. Ausente,
 * malformado ou erro de leitura = ligado (o comportamento de antes).
 *
 * Desligado não é esconder botão — é NÃO PRODUZIR TRABALHO DE IA:
 *   - a mídia recebida não pede leitura (`media.derive_requested` não nasce,
 *     `workers/media-persist-worker.ts`);
 *   - a mensagem recebida não despacha o agente
 *     (`ai_agent.dispatch_requested` não nasce, `lib/channels/pos-entrada.ts`);
 *   - o que já estava na fila quando desligou é encerrado sem chamar a IA
 *     (worker de mídia e dreno do despacho);
 *   - as telas de IA somem do menu e as rotas recusam.
 * Sem evento não há morte, e sem morte não há aviso. Nada é apagado: religar
 * devolve tudo — conversas, agentes, configurações.
 *
 * Irmão de `definirAiDecideDaEmpresa` (um PASSO das automações); este é o
 * atendimento com IA inteiro. Não mexe em `contacts.ai_opt_out` nem
 * `force_human`, que são por contato e continuam valendo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** A chave de `organizations.settings`; dentro dela, `{ enabled: false }` desliga. */
export const CHAVE_DA_IA_DA_EMPRESA = "ia";

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Pura: só `settings.ia.enabled === false` desliga. */
export function iaLigadaNaEmpresa(settings: unknown): boolean {
  return objeto(objeto(settings)?.[CHAVE_DA_IA_DA_EMPRESA])?.enabled !== false;
}

/**
 * Lê a linha da organização pelo client do Supabase. Nunca lança; erro = ligado
 * (falha para o comportamento de antes, não para um silêncio novo).
 */
export async function iaDaEmpresaLigada(db: SupabaseClient, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) throw error;
    return iaLigadaNaEmpresa((data as { settings?: unknown } | null)?.settings);
  } catch (err) {
    logger.warn("ia da empresa: leitura falhou — tratando como ligada", {
      organization_id: organizationId,
      detalhe: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/** A mesma pergunta pelo pool do agent-engine (dreno do despacho). */
export async function iaDaEmpresaLigadaPeloPool(
  pool: Pick<import("pg").Pool, "query">,
  organizationId: string,
): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ settings: unknown }>(
      "select settings from public.organizations where id = $1",
      [organizationId],
    );
    return iaLigadaNaEmpresa(rows[0]?.settings);
  } catch {
    return true;
  }
}
