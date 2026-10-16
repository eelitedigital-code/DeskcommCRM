import { describe, expect, it } from "vitest";

import { aplicarPatch, CONFIGURACAO_PADRAO, lerConfiguracao, patchSchema } from "./configuracao";

describe("lerConfiguracao — nunca lança, cai no padrão item por item", () => {
  it("sem nada gravado: padrão (24 h com IA ligada; 5/15/15 min)", () => {
    expect(lerConfiguracao(null)).toEqual(CONFIGURACAO_PADRAO);
    expect(lerConfiguracao({ outra_coisa: 1 })).toEqual(CONFIGURACAO_PADRAO);
  });

  it("lê o que é válido e descarta o resto", () => {
    const c = lerConfiguracao({
      painel_atendimento: {
        conta_24h_com_ia: false,
        limiares: { resposta_esperado_min: 3, resposta_atencao_min: "dez", espera_limite_min: 30 },
        rotulos_de_origem: { Meta: "Anúncios Meta", vazio: "", "": "Sem origem" },
      },
    });
    expect(c.conta_24h_com_ia).toBe(false);
    expect(c.limiares).toEqual({ resposta_esperado_min: 3, resposta_atencao_min: 15, espera_limite_min: 30 });
    expect(c.rotulos_de_origem).toEqual({ Meta: "Anúncios Meta" });
  });

  it("régua torta volta ao par padrão", () => {
    const c = lerConfiguracao({ painel_atendimento: { limiares: { resposta_esperado_min: 20, resposta_atencao_min: 10 } } });
    expect(c.limiares.resposta_esperado_min).toBe(5);
    expect(c.limiares.resposta_atencao_min).toBe(15);
  });
});

describe("patchSchema + aplicarPatch", () => {
  it("aceita parcial e mescla sem apagar o resto", () => {
    const patch = patchSchema.parse({ limiares: { espera_limite_min: 10 }, rotulos_de_origem: { Meta: "Anúncios" } });
    const c = aplicarPatch(CONFIGURACAO_PADRAO, patch);
    expect(c).toEqual({
      conta_24h_com_ia: true,
      limiares: { resposta_esperado_min: 5, resposta_atencao_min: 15, espera_limite_min: 10 },
      rotulos_de_origem: { Meta: "Anúncios" },
    });
  });

  it("null num rótulo apaga só aquele", () => {
    const atual = { ...CONFIGURACAO_PADRAO, rotulos_de_origem: { Meta: "A", Face: "B" } };
    const c = aplicarPatch(atual, patchSchema.parse({ rotulos_de_origem: { Meta: null } }));
    expect(c?.rotulos_de_origem).toEqual({ Face: "B" });
  });

  it("recusa régua torta, campo desconhecido e corpo vazio", () => {
    expect(aplicarPatch(CONFIGURACAO_PADRAO, patchSchema.parse({ limiares: { resposta_esperado_min: 15 } }))).toBeNull();
    expect(patchSchema.safeParse({ outra: 1 }).success).toBe(false);
    expect(patchSchema.safeParse({}).success).toBe(false);
    expect(patchSchema.safeParse({ limiares: { espera_limite_min: 0 } }).success).toBe(false);
  });
});
