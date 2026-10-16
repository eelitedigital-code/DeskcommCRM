/**
 * "Canal com mais leads" (D9) — a montagem PURA do quadro, sem banco.
 *
 * A contagem é da função `fn_painel_atendimento` (contatos novos no período,
 * agrupados pelo valor cru de `contacts.source`). Aqui só se faz o que a conta
 * não faz: dar nome, juntar o que tem o mesmo nome, ordenar, cortar em
 * "Outros" e calcular percentual e variação.
 *
 * Regras (Spec 04 §4):
 *   - origem vazia vira "Sem origem" — nunca some;
 *   - rótulos só na leitura: o mapa padrão abaixo, sobreposto pelo da
 *     organização (`settings.painel_atendimento.rotulos_de_origem`). A origem
 *     gravada no contato nunca é reescrita;
 *   - `webhook:<nome da fonte>` aparece à parte, com o nome da fonte;
 *   - mais de 6 canais: os 5 maiores e "Outros";
 *   - período anterior zerado não divide por zero: a variação fica `null`.
 */

export interface LinhaDeOrigem {
  /** Valor cru (`contacts.source`, ou `webhook:<nome da fonte>`); `""` = sem origem. */
  origem: string;
  atual: number;
  anterior: number;
}

/** O ícone é um TIPO de canal, nunca a marca de ninguém (§6). */
export type IconeDeCanal =
  | "anuncio"
  | "formulario"
  | "whatsapp"
  | "rede_social"
  | "indicacao"
  | "site"
  | "manual"
  | "sem_origem"
  | "outros";

export interface Canal {
  /** Chave estável do agrupamento (o rótulo, ou "__sem_origem__"/"__outros__"). */
  chave: string;
  rotulo: string;
  icone: IconeDeCanal;
  atual: number;
  anterior: number;
  /** Fatia do total do período, 0–100. */
  percentual: number;
  /** Variação contra o período anterior, em %; `null` quando o anterior é zero. */
  variacao: number | null;
}

export interface QuadroDeCanais {
  total: number;
  total_anterior: number;
  variacao: number | null;
  /** O canal com mais contatos novos no período; `null` sem nenhum. */
  lider: Canal | null;
  canais: Canal[];
}

export const ROTULO_SEM_ORIGEM = "Sem origem";
export const ROTULO_OUTROS = "Outros";
const MAXIMO_SEM_AGRUPAR = 6;
const MOSTRADOS_COM_OUTROS = 5;

/** O nome que a tela dá a cada valor conhecido. Desconhecido aparece cru. */
export const ROTULOS_PADRAO: Readonly<Record<string, string>> = {
  meta_ads: "Anúncios Meta (clique para WhatsApp)",
  google_ads: "Anúncios Google",
  whatsapp: "WhatsApp direto",
  social: "Redes sociais",
  instagram: "Instagram",
  facebook: "Facebook",
  webhook: "Formulários e site",
  manual: "Cadastro manual",
  prospecting: "Prospecção",
  nuvemshop: "Nuvemshop",
  indicacao: "Indicação",
  site: "Site",
};

const ICONE_PADRAO: Readonly<Record<string, IconeDeCanal>> = {
  meta_ads: "anuncio",
  google_ads: "anuncio",
  whatsapp: "whatsapp",
  social: "rede_social",
  instagram: "rede_social",
  facebook: "rede_social",
  webhook: "formulario",
  manual: "manual",
  indicacao: "indicacao",
  site: "site",
};

const PREFIXO_WEBHOOK = "webhook:";

function iconeDa(origem: string): IconeDeCanal {
  if (origem === "") return "sem_origem";
  if (origem.startsWith(PREFIXO_WEBHOOK)) return "formulario";
  return ICONE_PADRAO[origem] ?? "outros";
}

/** O rótulo de UM valor cru: o da organização vence o padrão. */
export function rotuloDaOrigem(origem: string, daOrganizacao: Record<string, string> = {}): string {
  const proprio = daOrganizacao[origem];
  if (proprio) return proprio;
  if (origem === "") return ROTULO_SEM_ORIGEM;
  if (origem.startsWith(PREFIXO_WEBHOOK)) return origem.slice(PREFIXO_WEBHOOK.length) || ROTULOS_PADRAO.webhook!;
  return ROTULOS_PADRAO[origem] ?? origem;
}

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function seguro(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

export function montarQuadroDeCanais(
  linhas: readonly LinhaDeOrigem[] | null | undefined,
  daOrganizacao: Record<string, string> = {},
): QuadroDeCanais {
  // 1. nome + soma do que tem o mesmo nome
  const porRotulo = new Map<string, Omit<Canal, "percentual" | "variacao">>();
  for (const l of linhas ?? []) {
    if (typeof l?.origem !== "string") continue;
    const origem = l.origem.trim();
    const rotulo = rotuloDaOrigem(origem, daOrganizacao);
    const chave = origem === "" && !daOrganizacao[""] ? "__sem_origem__" : rotulo;
    const ja = porRotulo.get(chave);
    if (ja) {
      ja.atual += seguro(l.atual);
      ja.anterior += seguro(l.anterior);
    } else {
      porRotulo.set(chave, { chave, rotulo, icone: iconeDa(origem), atual: seguro(l.atual), anterior: seguro(l.anterior) });
    }
  }

  // 2. só o que tem algo a mostrar, maior primeiro (desempate pelo nome)
  let canais = [...porRotulo.values()]
    .filter((c) => c.atual > 0 || c.anterior > 0)
    .sort((a, b) => b.atual - a.atual || b.anterior - a.anterior || a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  // 3. mais de 6: os 5 maiores e "Outros"
  if (canais.length > MAXIMO_SEM_AGRUPAR) {
    const resto = canais.slice(MOSTRADOS_COM_OUTROS);
    canais = [
      ...canais.slice(0, MOSTRADOS_COM_OUTROS),
      {
        chave: "__outros__",
        rotulo: ROTULO_OUTROS,
        icone: "outros",
        atual: resto.reduce((s, c) => s + c.atual, 0),
        anterior: resto.reduce((s, c) => s + c.anterior, 0),
      },
    ];
  }

  const total = canais.reduce((s, c) => s + c.atual, 0);
  const totalAnterior = canais.reduce((s, c) => s + c.anterior, 0);
  const prontos: Canal[] = canais.map((c) => ({
    ...c,
    percentual: total > 0 ? (c.atual / total) * 100 : 0,
    variacao: variacaoPercentual(c.atual, c.anterior),
  }));
  const primeiro = prontos[0];
  const lider = primeiro && primeiro.atual > 0 && primeiro.chave !== "__outros__" ? primeiro : null;

  return {
    total,
    total_anterior: totalAnterior,
    variacao: variacaoPercentual(total, totalAnterior),
    lider,
    canais: prontos,
  };
}
