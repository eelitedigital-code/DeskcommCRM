/**
 * AS CAPACIDADES DA ORGANIZAÇÃO — o que ESTA empresa ligou para si.
 *
 * Irmã de `lib/instalacao/modulos.ts`, em outro nível: módulo opcional é
 * decisão da INSTALAÇÃO (o dono do servidor); capacidade é decisão da
 * ORGANIZAÇÃO (o administrador da empresa). A doutrina de extensões diz a
 * mesma coisa: "a instância decide o pacote; a organização decide o uso".
 *
 * Só o booleano `true` liga. Ausente, malformado, string ou erro de banco =
 * desligado: falha fechada, como `modulosLigados()`. Nunca lança — roda no
 * layout de `/app` e no turno do agente, e um throw ali derruba a tela ou o
 * atendimento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { modulosLigados, type ModuloOpcional } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";

export const CAPACIDADES_DA_ORGANIZACAO = ["propostas", "empresas", "ia"] as const;
export type CapacidadeDaOrganizacao = (typeof CAPACIDADES_DA_ORGANIZACAO)[number];

/**
 * O módulo da INSTALAÇÃO que cada capacidade exige (doc 79). A empresa liga a
 * dela; com o módulo desligado no servidor, a chave da empresa não liga nada —
 * e é aqui, e não em cada consumidor, que as duas se somam: tela, menu, rota,
 * ferramenta do agente e cron leem a mesma resposta.
 */
const MODULO_DA_CAPACIDADE: Record<CapacidadeDaOrganizacao, ModuloOpcional | null> = {
  propostas: "propostas",
  // Empresas, equipe e painel de vendas da empresa (cadastro B2B). Nem todo
  // cliente vende para empresa: a instalação oferece o módulo, e cada empresa
  // liga para si.
  empresas: "crm_b2b",
  // O atendimento com IA não depende de módulo da instalação: é núcleo.
  ia: null,
};

/**
 * A chave de `organizations.settings` de cada capacidade — `{ enabled: true }`
 * dentro dela liga. `propostas` lê `settings.proposals` desde antes desta
 * lista existir; `empresas` segue o mesmo formato em `settings.companies`.
 */
export const CHAVE_DA_CAPACIDADE: Record<CapacidadeDaOrganizacao, string> = {
  propostas: "proposals",
  empresas: "companies",
  ia: "ia",
};

/**
 * Capacidades LIGADAS POR PADRÃO: ausente conta como ligada, e só o `false`
 * explícito desliga. É o caso da IA (`lib/organizacao/ia-da-empresa.ts`):
 * nascer desligada mudaria o atendimento de quem já usa. As demais seguem a
 * regra de sempre (só o `true` liga).
 */
const LIGADA_POR_PADRAO: ReadonlySet<CapacidadeDaOrganizacao> = new Set(["ia"]);

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * `organizations.settings` + os módulos ligados na instalação → as
 * capacidades ligadas. Pura; nunca lança.
 */
export function capacidadesLigadas(
  settings: unknown,
  modulos: readonly ModuloOpcional[],
): CapacidadeDaOrganizacao[] {
  const s = objeto(settings);
  const daEmpresa = CAPACIDADES_DA_ORGANIZACAO.filter((c) => {
    const enabled = objeto(s?.[CHAVE_DA_CAPACIDADE[c]])?.enabled;
    return LIGADA_POR_PADRAO.has(c) ? enabled !== false : enabled === true;
  });
  return daEmpresa.filter((c) => {
    const modulo = MODULO_DA_CAPACIDADE[c];
    return modulo === null || modulos.includes(modulo);
  });
}

/** Lê a linha da organização. Nunca lança: erro = nenhuma capacidade. */
export async function capacidadesDaOrganizacao(
  db: SupabaseClient,
  organizationId: string,
): Promise<CapacidadeDaOrganizacao[]> {
  try {
    const [{ data, error }, modulos] = await Promise.all([
      db.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
      modulosLigados(db),
    ]);
    if (error) {
      logger.warn("capacidades da organização: leitura recusada — tratando todas como desligadas", {
        organization_id: organizationId,
        detalhe: (error as { message?: string }).message,
      });
      return [];
    }
    // Organização inexistente não tem capacidade nenhuma — nem as ligadas por
    // padrão, que só valem para uma linha que existe.
    if (!data) return [];
    return capacidadesLigadas((data as { settings?: unknown }).settings, modulos);
  } catch (erro) {
    logger.warn("capacidades da organização: leitura falhou — tratando todas como desligadas", {
      organization_id: organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return [];
  }
}
