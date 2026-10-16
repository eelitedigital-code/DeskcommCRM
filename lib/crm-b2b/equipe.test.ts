import { describe, expect, it } from "vitest";

import { finalDoNumero, identidadeNaTela } from "@/lib/crm-b2b/equipe";

const contato = {
  id: "c1",
  name: "João Silva",
  display_name: "Joãozinho",
  phone_number: "+5537999981234",
  person_id: "p1",
  is_anonymized: false,
};

describe("identidadeNaTela — as três formas da Especificação 02 (D3 × D8)", () => {
  it("ativo: nome, cargo e final do número, com link para o contato", () => {
    expect(identidadeNaTela({ job_title: "Sócio", saiu_em: null }, contato)).toEqual({
      situacao: "ativo",
      nome: "João Silva",
      cargo: "Sócio",
      final_do_numero: "1234",
      contact_id: "c1",
    });
  });

  it("saiu: SEM nome e sem link; fica cargo e final do número", () => {
    expect(
      identidadeNaTela(
        { job_title: "Gerente de compras", saiu_em: "2026-10-01T00:00:00Z" },
        contato,
      ),
    ).toEqual({
      situacao: "saiu",
      nome: null,
      cargo: "Gerente de compras",
      final_do_numero: "1234",
      contact_id: null,
    });
  });

  it("anonimizado: nada que identifique — nem nome, nem cargo, nem número", () => {
    expect(
      identidadeNaTela({ job_title: "Sócio", saiu_em: null }, { ...contato, is_anonymized: true }),
    ).toEqual({
      situacao: "anonimizado",
      nome: null,
      cargo: null,
      final_do_numero: null,
      contact_id: null,
    });
  });

  it("anonimização vence a saída", () => {
    expect(
      identidadeNaTela(
        { job_title: "Sócio", saiu_em: "2026-10-01T00:00:00Z" },
        { ...contato, is_anonymized: true },
      ).situacao,
    ).toBe("anonimizado");
  });

  it("sem contato nenhum ligado à pessoa: tratado como anonimizado (não há o que mostrar)", () => {
    expect(identidadeNaTela({ job_title: "Sócio", saiu_em: null }, null).situacao).toBe(
      "anonimizado",
    );
  });

  it("sem nome cadastrado usa o nome do WhatsApp", () => {
    expect(
      identidadeNaTela({ job_title: null, saiu_em: null }, { ...contato, name: null }).nome,
    ).toBe("Joãozinho");
  });
});

describe("finalDoNumero", () => {
  it("os 4 últimos dígitos, ignorando o que não é dígito", () => {
    expect(finalDoNumero("+55 (37) 99998-4821")).toBe("4821");
  });
  it("vazio ou curto demais: nulo", () => {
    expect(finalDoNumero(null)).toBeNull();
    expect(finalDoNumero("12")).toBeNull();
  });
});
