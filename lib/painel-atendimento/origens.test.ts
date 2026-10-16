import { describe, expect, it } from "vitest";

import { montarQuadroDeCanais, rotuloDaOrigem, ROTULO_OUTROS, ROTULO_SEM_ORIGEM, variacaoPercentual } from "./origens";

describe("Canal com mais leads — montagem (D9, §4)", () => {
  it("origem vazia vira 'Sem origem' e nunca some", () => {
    const q = montarQuadroDeCanais([
      { origem: "", atual: 3, anterior: 0 },
      { origem: "whatsapp", atual: 1, anterior: 0 },
    ]);
    expect(q.canais[0]?.rotulo).toBe(ROTULO_SEM_ORIGEM);
    expect(q.canais[0]?.icone).toBe("sem_origem");
    expect(q.total).toBe(4);
  });

  it("rótulos padrão da especificação", () => {
    expect(rotuloDaOrigem("meta_ads")).toBe("Anúncios Meta (clique para WhatsApp)");
    expect(rotuloDaOrigem("whatsapp")).toBe("WhatsApp direto");
    expect(rotuloDaOrigem("social")).toBe("Redes sociais");
    expect(rotuloDaOrigem("webhook")).toBe("Formulários e site");
    expect(rotuloDaOrigem("manual")).toBe("Cadastro manual");
    expect(rotuloDaOrigem("webhook:Formulário Meta")).toBe("Formulário Meta");
    expect(rotuloDaOrigem("valor_estranho")).toBe("valor_estranho");
  });

  it("valores parecidos somam quando a organização dá o mesmo nome", () => {
    const q = montarQuadroDeCanais(
      [
        { origem: "meta_ads", atual: 2, anterior: 1 },
        { origem: "Meta", atual: 1, anterior: 0 },
        { origem: "facebook", atual: 1, anterior: 1 },
      ],
      { Meta: "Anúncios Meta (clique para WhatsApp)", facebook: "Anúncios Meta (clique para WhatsApp)" },
    );
    expect(q.canais).toHaveLength(1);
    expect(q.canais[0]).toMatchObject({ atual: 4, anterior: 2, icone: "anuncio" });
  });

  it("mais de 6 canais: os 5 maiores e 'Outros'", () => {
    const linhas = ["a", "b", "c", "d", "e", "f", "g"].map((o, i) => ({ origem: o, atual: 10 - i, anterior: 0 }));
    const q = montarQuadroDeCanais(linhas);
    expect(q.canais).toHaveLength(6);
    expect(q.canais.slice(0, 5).map((c) => c.rotulo)).toEqual(["a", "b", "c", "d", "e"]);
    expect(q.canais[5]).toMatchObject({ rotulo: ROTULO_OUTROS, atual: 5 + 4, icone: "outros" });
    expect(q.total).toBe(10 + 9 + 8 + 7 + 6 + 5 + 4);
  });

  it("exatamente 6 canais não agrupa", () => {
    const linhas = ["a", "b", "c", "d", "e", "f"].map((o) => ({ origem: o, atual: 1, anterior: 0 }));
    expect(montarQuadroDeCanais(linhas).canais).toHaveLength(6);
  });

  it("período anterior zerado não divide por zero", () => {
    const q = montarQuadroDeCanais([{ origem: "whatsapp", atual: 5, anterior: 0 }]);
    expect(q.variacao).toBeNull();
    expect(q.canais[0]?.variacao).toBeNull();
    expect(variacaoPercentual(5, 0)).toBeNull();
    expect(variacaoPercentual(6, 4)).toBe(50);
  });

  it("percentual e líder", () => {
    const q = montarQuadroDeCanais([
      { origem: "whatsapp", atual: 3, anterior: 2 },
      { origem: "meta_ads", atual: 1, anterior: 0 },
    ]);
    expect(q.lider?.rotulo).toBe("WhatsApp direto");
    expect(q.canais[0]?.percentual).toBe(75);
    expect(q.canais[1]?.percentual).toBe(25);
  });

  it("sem nenhum contato novo: sem líder e total zero (a tela mostra o vazio)", () => {
    const q = montarQuadroDeCanais([]);
    expect(q).toMatchObject({ total: 0, lider: null, canais: [] });
    expect(montarQuadroDeCanais(null).total).toBe(0);
  });
});
