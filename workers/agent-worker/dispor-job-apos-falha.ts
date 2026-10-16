import type { Pool } from "pg";
import type { Logger } from "@/lib/agent-engine/obs/logger";
import { claimOfJob } from "@/lib/agent-engine/queue/claim";
import { cancelJob, failJob, type JobRow } from "@/lib/agent-engine/queue/queue";
import { avisarRespostaDeCasoObsoleto } from "@/lib/atendimento/aviso-caso-obsoleto";
import { descartarFollowupObsoleto } from "@/lib/atendimento/descartar-followup-obsoleto";
import { StaleServiceBoundaryError } from "@/lib/atendimento/fronteira";
import { avisarIaSemChavePeloPool, ehFaltaDeChaveDeIa } from "@/lib/event-log/ia-sem-chave";

/** Disposição usada pelo catch real do worker, sem iniciar seus loops no teste.
 * O lease original protege toda escrita; nunca cancela o trabalho de outro ciclo.
 */
export async function disporJobAposFalha(
  pool: Pool,
  job: JobRow,
  workerId: string,
  error: unknown,
  terminal: boolean,
  log: Pick<Logger, "warn">,
): Promise<void> {
  if (
    error instanceof StaleServiceBoundaryError &&
    job.kind === "case_reply_turn" &&
    typeof job.payload.case_id === "string"
  ) {
    await avisarRespostaDeCasoObsoleto(pool, job.organization_id, job.payload.case_id);
  }
  if (error instanceof StaleServiceBoundaryError && job.kind === "followup_turn") {
    await descartarFollowupObsoleto(pool, job, workerId, log);
  } else if (terminal) {
    const reason = error instanceof Error ? error.message : String(error);
    await cancelJob(pool, job.id, workerId, (reason.split("\n", 1)[0] ?? "").slice(0, 300), claimOfJob(job)?.acquired_at);
  } else if (ehFaltaDeChaveDeIa(error)) {
    // IA sem chave: a fila CONTINUA tentando (quem cadastrar a chave nesse
    // intervalo tem a conversa respondida — ver `LlmEnderecoExigeChaveDaEmpresaError`),
    // mas, ao desistir, abre o aviso de ATENÇÃO único da organização em vez de
    // um `job_dead` crítico por job.
    const row = await failJob(pool, job.id, workerId, error, claimOfJob(job)?.acquired_at, {
      avisoCritico: false,
    });
    if (row?.status === "dead") {
      const motivo = error instanceof Error ? error.message : String(error);
      await avisarIaSemChavePeloPool(pool, job.organization_id, motivo);
    }
  } else {
    await failJob(pool, job.id, workerId, error, claimOfJob(job)?.acquired_at);
  }
}
