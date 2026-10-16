/**
 * A CARGA do painel — o que uma consulta produz e o cache do processo guarda.
 *
 * Mora aqui, e não na rota, por dois motivos: arquivo de rota do Next só
 * exporta os métodos HTTP, e a rota de configuração precisa do MESMO cache
 * para invalidá-lo quando a régua de uma organização muda.
 *
 * A carga é igual para todo nível de acesso: o recorte por papel
 * (`montarPainel`) acontece depois, a cada pedido.
 */
import { modulosLigados } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";
import { capacidadesLigadas } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

import { CacheDoPainel } from "./cache";
import { lerConfiguracao, type ConfiguracaoDoPainel } from "./configuracao";
import type { PainelBruto } from "./montar";
import { janelaDoPeriodo, type Periodo } from "./periodo";

export interface CargaDoPainel {
  bruto: PainelBruto;
  iaLigada: boolean;
  configuracao: ConfiguracaoDoPainel;
  nomes: Map<string, string | null>;
}

export interface FiltrosDoPainel {
  periodo: Periodo;
  de?: string;
  ate?: string;
  numero?: string;
  atendente?: string;
}

export const cacheDoPainel = new CacheDoPainel<CargaDoPainel>();

/** Mudar a régua de uma organização invalida só o painel DELA. */
export function invalidarPainelDaOrganizacao(organizationId: string): void {
  cacheDoPainel.invalidarOrganizacao(organizationId);
}

export class FalhaNaCarga extends Error {}

/**
 * Lê a organização (fuso, configuração, IA ligada), chama a função do banco
 * e resolve o nome de quem atende. A organização vem SEMPRE de quem chama
 * (a sessão), e é filtrada explicitamente — o client é o admin.
 */
export async function carregarPainel(organizationId: string, filtros: FiltrosDoPainel): Promise<CargaDoPainel> {
  const admin = createAdminClient();
  const { data: org, error: erroOrg } = await admin
    .from("organizations")
    .select("timezone, settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (erroOrg || !org) throw new FalhaNaCarga(erroOrg?.message ?? "organização não encontrada");
  const linha = org as { timezone?: string | null; settings?: unknown };

  const configuracao = lerConfiguracao(linha.settings);
  const iaLigada = capacidadesLigadas(linha.settings, await modulosLigados(admin)).includes("ia");

  const janela = janelaDoPeriodo(filtros.periodo, { de: filtros.de, ate: filtros.ate, fuso: linha.timezone });
  if (!janela.ok) throw new FalhaNaCarga(janela.motivo);

  // Uma linha por consulta DE VERDADE: é por ela que se prova que dez abas
  // abertas fazem uma consulta por janela de cache (D4).
  logger.info("painel_atendimento.consulta", {
    organization_id: organizationId,
    periodo: filtros.periodo,
    numero: filtros.numero ?? null,
    atendente: filtros.atendente ?? null,
  });

  const { data, error } = await admin.rpc("fn_painel_atendimento" as never, {
    p_org: organizationId,
    p_from: janela.de.toISOString(),
    p_to: janela.ate.toISOString(),
    p_numero: filtros.numero ?? null,
    p_atendente: filtros.atendente ?? null,
    p_ia_ligada: iaLigada,
    p_24h_com_ia: configuracao.conta_24h_com_ia,
    p_limite_espera_s: configuracao.limiares.espera_limite_min * 60,
  } as never);
  if (error || !data) throw new FalhaNaCarga((error as { message?: string } | null)?.message ?? "sem resposta");
  const bruto = data as unknown as PainelBruto;

  // Nome de quem atende: o mesmo caminho de /api/v1/metrics/attendants.
  const nomes = new Map<string, string | null>();
  await Promise.all(
    (bruto.por_atendente ?? []).map(async (l) => {
      const { data: res } = await admin.auth.admin.getUserById(l.user_id);
      const u = res?.user;
      nomes.set(l.user_id, (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? null);
    }),
  );

  return { bruto, iaLigada, configuracao, nomes };
}
