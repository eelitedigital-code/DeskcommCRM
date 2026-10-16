import { describe, expect, it } from "vitest";

import { CONFIGURACAO_PADRAO } from "./configuracao";
import { montarPainel, seloDaEspera, seloDoTempo, type PainelBruto } from "./montar";

const EU = "11111111-1111-4111-8111-111111111111";
const COLEGA = "22222222-2222-4222-8222-222222222222";

function bruto(parcial: Partial<PainelBruto> = {}): PainelBruto {
  const est = { pares: 0, media_s: null, mediana_s: null };
  return {
    periodo: { de: "2026-07-01T00:00:00Z", ate: "2026-07-31T00:00:00Z", de_anterior: "2026-06-01T00:00:00Z", fuso: "America/Sao_Paulo" },
    volume: {
      recebidas: 10,
      enviadas: 8,
      enviadas_por: { ia: 3, humano: 5, automacao: 0, sistema: 0, crm: 0 },
      anterior: { recebidas: 5, enviadas: 0 },
    },
    resposta: {
      pares: 4,
      media_s: 400,
      mediana_s: 200,
      sem_resposta: 1,
      ia: { pares: 2, media_s: 20, mediana_s: 20 },
      humano: { pares: 2, media_s: 780, mediana_s: 780 },
      por_regra: { janela: 0, sem_janela: 4, "24h_ia": 0 },
      anterior: { ...est, pares: 1, media_s: 200 },
    },
    primeira_resposta: { conversas: 2, media_s: 300 },
    agora: { ativas: 5, aguardando: 3, acima_do_limite: 1, ate_5_min: 1, de_5_a_15_min: 1, acima_de_15_min: 1 },
    por_hora: [],
    por_dia: [],
    por_numero: [
      { channel_session_id: "n1", nome: "+5587", arquivado: false, regra: "sem_janela", hora_ini: null, hora_fim: null,
        recebidas: 10, enviadas: 8, pares: 4, media_s: 400, mediana_s: 200, aguardando: 3 },
    ],
    por_atendente: [
      { quem: "humano", user_id: EU, enviadas: 3, pares: 1, media_s: 600, mediana_s: 600, aguardando: 1 },
      { quem: "humano", user_id: COLEGA, enviadas: 2, pares: 1, media_s: 960, mediana_s: 960, aguardando: 2 },
    ],
    ia: { enviadas: 3, pares: 2, media_s: 20, mediana_s: 20, aguardando: 0 },
    origens: [{ origem: "whatsapp", atual: 2, anterior: 1 }],
    ...parcial,
  };
}

const nomes = new Map([[EU, "Eu"], [COLEGA, "Colega"]]);

describe("montarPainel — quem vê o quê (D2)", () => {
  it("gerente vê todos os atendentes, a IA e o canal com mais leads", () => {
    const p = montarPainel(bruto(), { quem: { userId: EU, gerente: true }, iaLigada: true, configuracao: CONFIGURACAO_PADRAO, nomes });
    expect(p.por_atendente.map((l) => l.nome ?? l.quem)).toEqual(["Eu", "Colega", "ia"]);
    expect(p.canais_de_leads?.total).toBe(2);
  });

  it("atendente vê os totais da empresa, a própria linha e não vê colega nem canais", () => {
    const p = montarPainel(bruto(), { quem: { userId: EU, gerente: false }, iaLigada: true, configuracao: CONFIGURACAO_PADRAO, nomes });
    expect(p.cartoes.mensagens.recebidas).toBe(10);
    expect(p.por_numero).toHaveLength(1);
    expect(p.por_atendente.map((l) => l.user_id)).toEqual([EU, null]);
    expect(JSON.stringify(p)).not.toContain(COLEGA);
    expect(JSON.stringify(p)).not.toContain("Colega");
    expect(p.canais_de_leads).toBeNull();
  });
});

describe("montarPainel — IA desligada (D7)", () => {
  it("some o bloco IA x Pessoa e a linha da IA", () => {
    const p = montarPainel(bruto(), { quem: { userId: EU, gerente: true }, iaLigada: false, configuracao: CONFIGURACAO_PADRAO, nomes });
    expect(p.ia_x_pessoa).toBeNull();
    expect(p.por_atendente.some((l) => l.quem === "ia")).toBe(false);
  });
});

describe("montarPainel — cartões, avisos e vazio", () => {
  it("variação contra o período anterior e selos pela régua", () => {
    const p = montarPainel(bruto(), { quem: { userId: EU, gerente: true }, iaLigada: true, configuracao: CONFIGURACAO_PADRAO, nomes });
    expect(p.cartoes.mensagens.variacao_recebidas).toBe(100);
    expect(p.cartoes.mensagens.variacao_enviadas).toBeNull(); // anterior zero
    expect(p.cartoes.tempo_de_resposta.variacao_media).toBe(100);
    expect(p.cartoes.tempo_de_resposta.selo).toBe("atencao"); // 400 s: entre 5 e 15 min
    expect(p.cartoes.tempo_de_resposta.primeira_resposta_s).toBe(300);
    expect(p.cartoes.espera).toEqual({ acima_do_limite: 1, limite_min: 15, selo: "atencao" });
    expect(p.aviso_sem_janela).toBe(true);
    expect(p.vazio).toBe(false);
  });

  it("período sem mensagem nenhuma é vazio, não zero", () => {
    const p = montarPainel(
      bruto({ volume: { recebidas: 0, enviadas: 0, enviadas_por: { ia: 0, humano: 0, automacao: 0, sistema: 0, crm: 0 }, anterior: { recebidas: 0, enviadas: 0 } } }),
      { quem: { userId: EU, gerente: true }, iaLigada: true, configuracao: CONFIGURACAO_PADRAO, nomes },
    );
    expect(p.vazio).toBe(true);
  });
});

describe("selos", () => {
  const l = CONFIGURACAO_PADRAO.limiares;
  it("tempo: até 5 min esperado, até 15 atenção, acima crítico, sem medida nulo", () => {
    expect(seloDoTempo(300, l)).toBe("esperado");
    expect(seloDoTempo(301, l)).toBe("atencao");
    expect(seloDoTempo(900, l)).toBe("atencao");
    expect(seloDoTempo(901, l)).toBe("critico");
    expect(seloDoTempo(null, l)).toBeNull();
  });
  it("espera acima do limite: 0 esperado, 1–2 atenção, 3+ crítico", () => {
    expect(seloDaEspera(0)).toBe("esperado");
    expect(seloDaEspera(2)).toBe("atencao");
    expect(seloDaEspera(3)).toBe("critico");
  });
});
