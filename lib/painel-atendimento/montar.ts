/**
 * A resposta do painel, por papel — montagem PURA sobre o que a função do
 * banco devolveu.
 *
 * A função `fn_painel_atendimento` calcula tudo para a organização; aqui se
 * decide o que cada um LEVA (Spec 04 D2/D7, §7):
 *
 *   - todo nível vê os totais da empresa e a quebra por número;
 *   - "Por atendente": gerente+ vê todos; os demais, só a própria linha;
 *   - "Canal com mais leads": só gerente+;
 *   - IA desligada (Spec 03): o bloco IA x Pessoa e a linha da IA somem.
 *
 * Nada de texto de mensagem, nome de contato ou telefone de cliente chega
 * aqui: a função só devolve números, e o nome que aparece é o do NÚMERO da
 * empresa e o do ATENDENTE.
 */
import type { ConfiguracaoDoPainel } from "./configuracao";
import { montarQuadroDeCanais, variacaoPercentual, type LinhaDeOrigem, type QuadroDeCanais } from "./origens";

type Num = number | null;

export interface EstatisticaDeResposta {
  pares: number;
  media_s: Num;
  mediana_s: Num;
}

export interface LinhaDeNumeroBruta {
  channel_session_id: string;
  nome: string | null;
  arquivado: boolean;
  regra: "janela" | "sem_janela" | "24h_ia";
  hora_ini: Num;
  hora_fim: Num;
  recebidas: number;
  enviadas: number;
  pares: number;
  media_s: Num;
  mediana_s: Num;
  aguardando: number;
}

export interface LinhaDeAtendenteBruta {
  quem: "humano";
  user_id: string;
  enviadas: number;
  pares: number;
  media_s: Num;
  mediana_s: Num;
  aguardando: number;
}

/** O jsonb de `fn_painel_atendimento`. */
export interface PainelBruto {
  periodo: { de: string; ate: string; de_anterior: string; fuso: string };
  volume: {
    recebidas: number;
    enviadas: number;
    enviadas_por: { ia: number; humano: number; automacao: number; sistema: number; crm: number };
    anterior: { recebidas: number; enviadas: number };
  };
  resposta: EstatisticaDeResposta & {
    sem_resposta: number;
    ia: EstatisticaDeResposta;
    humano: EstatisticaDeResposta;
    por_regra: { janela: number; sem_janela: number; "24h_ia": number };
    anterior: EstatisticaDeResposta;
  };
  primeira_resposta: { conversas: number; media_s: Num };
  agora: {
    ativas: number;
    aguardando: number;
    acima_do_limite: number;
    ate_5_min: number;
    de_5_a_15_min: number;
    acima_de_15_min: number;
  };
  por_hora: Array<{ hora: number; recebidas: number; enviadas: number }>;
  por_dia: Array<{ dia: string; pares: number; media_s: Num }>;
  por_numero: LinhaDeNumeroBruta[];
  por_atendente: LinhaDeAtendenteBruta[];
  ia: EstatisticaDeResposta & { enviadas: number; aguardando: number };
  origens: LinhaDeOrigem[];
}

export type Selo = "esperado" | "atencao" | "critico";

/** Selo do tempo de resposta pela régua da organização. `null` = não medido. */
export function seloDoTempo(segundos: Num, l: ConfiguracaoDoPainel["limiares"]): Selo | null {
  if (segundos === null || !Number.isFinite(segundos)) return null;
  if (segundos <= l.resposta_esperado_min * 60) return "esperado";
  if (segundos <= l.resposta_atencao_min * 60) return "atencao";
  return "critico";
}

/** Selo da espera acima do limite: nenhuma = esperado; até 2 = atenção; 3+ = crítico. */
export function seloDaEspera(acimaDoLimite: number): Selo {
  if (acimaDoLimite <= 0) return "esperado";
  if (acimaDoLimite < 3) return "atencao";
  return "critico";
}

export interface LinhaDeAtendente {
  quem: "humano" | "ia";
  user_id: string | null;
  nome: string | null;
  enviadas: number;
  pares: number;
  media_s: Num;
  mediana_s: Num;
  aguardando: number;
}

export interface Painel {
  periodo: PainelBruto["periodo"];
  ia_ligada: boolean;
  configuracao: ConfiguracaoDoPainel;
  /** Há resposta contada em número sem janela configurada (conta 24 h): a tela avisa. */
  aviso_sem_janela: boolean;
  /** Período sem nenhuma mensagem: a tela diz isso em vez de mostrar zeros. */
  vazio: boolean;
  cartoes: {
    mensagens: { recebidas: number; enviadas: number; variacao_recebidas: Num; variacao_enviadas: Num };
    tempo_de_resposta: {
      media_s: Num;
      mediana_s: Num;
      primeira_resposta_s: Num;
      variacao_media: Num;
      selo: Selo | null;
    };
    conversas: { ativas: number; aguardando: number };
    espera: { acima_do_limite: number; limite_min: number; selo: Selo };
  };
  volume: PainelBruto["volume"];
  resposta: { pares: number; media_s: Num; mediana_s: Num; sem_resposta: number; por_regra: PainelBruto["resposta"]["por_regra"] };
  /** `null` com a IA desligada (D7). */
  ia_x_pessoa: { ia: EstatisticaDeResposta; pessoa: EstatisticaDeResposta } | null;
  fila: { ate_5_min: number; de_5_a_15_min: number; acima_de_15_min: number };
  por_hora: PainelBruto["por_hora"];
  por_dia: PainelBruto["por_dia"];
  por_numero: LinhaDeNumeroBruta[];
  por_atendente: LinhaDeAtendente[];
  /** `null` para quem não é gerente (D2). */
  canais_de_leads: QuadroDeCanais | null;
}

export interface QuemPergunta {
  userId: string;
  /** gerente ou administrador. */
  gerente: boolean;
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function nn(v: unknown): Num {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function estat(e: Partial<EstatisticaDeResposta> | null | undefined): EstatisticaDeResposta {
  return { pares: n(e?.pares), media_s: nn(e?.media_s), mediana_s: nn(e?.mediana_s) };
}

export function montarPainel(
  bruto: PainelBruto,
  opcoes: {
    quem: QuemPergunta;
    iaLigada: boolean;
    configuracao: ConfiguracaoDoPainel;
    nomes: ReadonlyMap<string, string | null>;
  },
): Painel {
  const { quem, iaLigada, configuracao, nomes } = opcoes;
  const r = bruto.resposta;
  const v = bruto.volume;
  const agora = bruto.agora;

  const humanos: LinhaDeAtendente[] = (bruto.por_atendente ?? [])
    .filter((l) => quem.gerente || l.user_id === quem.userId)
    .map((l) => ({
      quem: "humano",
      user_id: l.user_id,
      nome: nomes.get(l.user_id) ?? null,
      enviadas: n(l.enviadas),
      pares: n(l.pares),
      media_s: nn(l.media_s),
      mediana_s: nn(l.mediana_s),
      aguardando: n(l.aguardando),
    }));
  const linhaIa: LinhaDeAtendente[] = iaLigada
    ? [{
        quem: "ia",
        user_id: null,
        nome: null,
        enviadas: n(bruto.ia?.enviadas),
        pares: n(bruto.ia?.pares),
        media_s: nn(bruto.ia?.media_s),
        mediana_s: nn(bruto.ia?.mediana_s),
        aguardando: n(bruto.ia?.aguardando),
      }]
    : [];

  const recebidas = n(v?.recebidas);
  const enviadas = n(v?.enviadas);

  return {
    periodo: bruto.periodo,
    ia_ligada: iaLigada,
    configuracao,
    aviso_sem_janela: (bruto.por_numero ?? []).some((l) => l.regra === "sem_janela" && !l.arquivado),
    vazio: recebidas + enviadas === 0,
    cartoes: {
      mensagens: {
        recebidas,
        enviadas,
        variacao_recebidas: variacaoPercentual(recebidas, n(v?.anterior?.recebidas)),
        variacao_enviadas: variacaoPercentual(enviadas, n(v?.anterior?.enviadas)),
      },
      tempo_de_resposta: {
        media_s: nn(r?.media_s),
        mediana_s: nn(r?.mediana_s),
        primeira_resposta_s: nn(bruto.primeira_resposta?.media_s),
        variacao_media:
          nn(r?.media_s) !== null && nn(r?.anterior?.media_s) !== null
            ? variacaoPercentual(r.media_s as number, r.anterior.media_s as number)
            : null,
        selo: seloDoTempo(nn(r?.media_s), configuracao.limiares),
      },
      conversas: { ativas: n(agora?.ativas), aguardando: n(agora?.aguardando) },
      espera: {
        acima_do_limite: n(agora?.acima_do_limite),
        limite_min: configuracao.limiares.espera_limite_min,
        selo: seloDaEspera(n(agora?.acima_do_limite)),
      },
    },
    volume: v,
    resposta: {
      pares: n(r?.pares),
      media_s: nn(r?.media_s),
      mediana_s: nn(r?.mediana_s),
      sem_resposta: n(r?.sem_resposta),
      por_regra: r?.por_regra ?? { janela: 0, sem_janela: 0, "24h_ia": 0 },
    },
    ia_x_pessoa: iaLigada ? { ia: estat(r?.ia), pessoa: estat(r?.humano) } : null,
    fila: {
      ate_5_min: n(agora?.ate_5_min),
      de_5_a_15_min: n(agora?.de_5_a_15_min),
      acima_de_15_min: n(agora?.acima_de_15_min),
    },
    por_hora: bruto.por_hora ?? [],
    por_dia: bruto.por_dia ?? [],
    por_numero: bruto.por_numero ?? [],
    por_atendente: [...humanos, ...linhaIa],
    canais_de_leads: quem.gerente ? montarQuadroDeCanais(bruto.origens, configuracao.rotulos_de_origem) : null,
  };
}
