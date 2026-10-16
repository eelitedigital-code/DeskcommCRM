/**
 * A configuração do painel de atendimento — `organizations.settings.painel_atendimento`.
 *
 * Mora em `settings` (D6): sem migration, no mesmo molde da régua do Atrito
 * (`settings.atrito`). Três coisas:
 *
 *   - `conta_24h_com_ia` (D5/D11): número com agente de IA no ar conta o tempo
 *     de resposta 24 h. Desligada, todo número conta só a própria janela de
 *     resposta. Padrão LIGADA (regra do dono).
 *   - `limiares` (D6): a régua dos selos "dentro do esperado / atenção /
 *     crítico" do tempo de resposta e o limite da espera.
 *   - `rotulos_de_origem` (D9): o nome que a tela dá a cada valor de
 *     `contacts.source`. Dois valores com o MESMO rótulo somam numa barra só —
 *     é assim que "meta", "Meta Ads" e "facebook" viram um canal sem reescrever
 *     a origem de ninguém.
 *
 * Ler nunca lança: chave ausente, malformada ou fora da faixa cai no padrão,
 * item por item. Gravar é outra conversa — o PATCH valida com `patchSchema`.
 */
import { z } from "zod";

export const CHAVE_DA_CONFIGURACAO = "painel_atendimento";

export interface Limiares {
  /** Tempo médio de resposta até aqui = dentro do esperado (minutos). */
  resposta_esperado_min: number;
  /** Até aqui = atenção; acima = crítico (minutos). */
  resposta_atencao_min: number;
  /** Espera que passa disto conta em "Espera acima do limite" (minutos). */
  espera_limite_min: number;
}

export interface ConfiguracaoDoPainel {
  conta_24h_com_ia: boolean;
  limiares: Limiares;
  rotulos_de_origem: Record<string, string>;
}

export const LIMIARES_PADRAO: Limiares = {
  resposta_esperado_min: 5,
  resposta_atencao_min: 15,
  espera_limite_min: 15,
};

export const CONFIGURACAO_PADRAO: ConfiguracaoDoPainel = {
  conta_24h_com_ia: true,
  limiares: LIMIARES_PADRAO,
  rotulos_de_origem: {},
};

const MINUTOS = z.number().int().min(1).max(24 * 60);
const CHAVE_DE_ORIGEM = z.string().trim().min(1).max(80);
const ROTULO = z.string().trim().min(1).max(60);

export const patchSchema = z
  .object({
    conta_24h_com_ia: z.boolean().optional(),
    limiares: z
      .object({
        resposta_esperado_min: MINUTOS.optional(),
        resposta_atencao_min: MINUTOS.optional(),
        espera_limite_min: MINUTOS.optional(),
      })
      .strict()
      .optional(),
    /** `null` num valor apaga o rótulo próprio daquela origem (volta ao padrão). */
    rotulos_de_origem: z.record(CHAVE_DE_ORIGEM, ROTULO.nullable()).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para salvar." });

export type PatchDaConfiguracao = z.infer<typeof patchSchema>;

/** Teto de rótulos próprios por organização — o mapa vai inteiro em cada leitura. */
export const MAXIMO_DE_ROTULOS = 50;

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function minutosOu(v: unknown, padrao: number): number {
  const r = MINUTOS.safeParse(v);
  return r.success ? r.data : padrao;
}

/** `organizations.settings` inteiro → a configuração do painel. Pura; nunca lança. */
export function lerConfiguracao(settings: unknown): ConfiguracaoDoPainel {
  const bruto = objeto(objeto(settings)?.[CHAVE_DA_CONFIGURACAO]);
  if (!bruto) return CONFIGURACAO_PADRAO;

  const l = objeto(bruto.limiares);
  let limiares: Limiares = {
    resposta_esperado_min: minutosOu(l?.resposta_esperado_min, LIMIARES_PADRAO.resposta_esperado_min),
    resposta_atencao_min: minutosOu(l?.resposta_atencao_min, LIMIARES_PADRAO.resposta_atencao_min),
    espera_limite_min: minutosOu(l?.espera_limite_min, LIMIARES_PADRAO.espera_limite_min),
  };
  // Régua torta (atenção antes do esperado) não pode pintar tudo de crítico:
  // volta ao par padrão inteiro.
  if (limiares.resposta_atencao_min <= limiares.resposta_esperado_min) {
    limiares = {
      ...limiares,
      resposta_esperado_min: LIMIARES_PADRAO.resposta_esperado_min,
      resposta_atencao_min: LIMIARES_PADRAO.resposta_atencao_min,
    };
  }

  const rotulos: Record<string, string> = {};
  const r = objeto(bruto.rotulos_de_origem);
  if (r) {
    for (const [chave, valor] of Object.entries(r).slice(0, MAXIMO_DE_ROTULOS)) {
      const c = CHAVE_DE_ORIGEM.safeParse(chave);
      const v = ROTULO.safeParse(valor);
      if (c.success && v.success) rotulos[c.data] = v.data;
    }
  }

  return {
    conta_24h_com_ia: bruto.conta_24h_com_ia !== false,
    limiares,
    rotulos_de_origem: rotulos,
  };
}

/**
 * Aplica um PATCH já validado sobre a configuração atual. Devolve `null`
 * quando o resultado não é gravável (régua torta ou rótulos demais) — quem
 * chama responde 422 sem tocar no banco.
 */
export function aplicarPatch(
  atual: ConfiguracaoDoPainel,
  patch: PatchDaConfiguracao,
): ConfiguracaoDoPainel | null {
  const limiares: Limiares = { ...atual.limiares, ...(patch.limiares ?? {}) };
  if (limiares.resposta_atencao_min <= limiares.resposta_esperado_min) return null;

  const rotulos: Record<string, string> = { ...atual.rotulos_de_origem };
  for (const [chave, valor] of Object.entries(patch.rotulos_de_origem ?? {})) {
    if (valor === null) delete rotulos[chave];
    else rotulos[chave] = valor;
  }
  if (Object.keys(rotulos).length > MAXIMO_DE_ROTULOS) return null;

  return {
    conta_24h_com_ia: patch.conta_24h_com_ia ?? atual.conta_24h_com_ia,
    limiares,
    rotulos_de_origem: rotulos,
  };
}
