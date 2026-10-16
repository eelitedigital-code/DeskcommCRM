import { describe, expect, it } from "vitest";

import {
  aplicarMudancas,
  camposDoCliente,
  camposDoNegocio,
  valorPreenchido,
} from "@/lib/contacts/campos-do-cliente";
import type { CustomFieldDef } from "@/lib/schemas/settings";

const cidade: CustomFieldDef = { key: "cidade", label: "Cidade", type: "text" };
const sexo: CustomFieldDef = {
  key: "sexo",
  label: "Sexo",
  type: "select",
  options: [
    { value: "f", label: "Feminino" },
    { value: "m", label: "Masculino" },
  ],
};

describe("camposDoCliente", () => {
  it("lê organizations.settings.contact_fields e marca todo campo como do contato", () => {
    const campos = camposDoCliente({ contact_fields: [cidade, { ...sexo, escopo: "negocio" }] });
    expect(campos.map((c) => [c.key, c.escopo])).toEqual([
      ["cidade", "contato"],
      ["sexo", "contato"],
    ]);
  });

  it("não explode com settings vazio, velho ou com entrada torta", () => {
    expect(camposDoCliente(null)).toEqual([]);
    expect(camposDoCliente({})).toEqual([]);
    expect(camposDoCliente({ contact_fields: "lixo" })).toEqual([]);
    expect(
      camposDoCliente({ contact_fields: [{ key: "1ruim" }, cidade] }).map((c) => c.key),
    ).toEqual(["cidade"]);
  });

  it("ignora os campos do funil guardados em settings.fields", () => {
    expect(camposDoCliente({ fields: [cidade] })).toEqual([]);
  });
});

describe("camposDoNegocio — a colisão legada", () => {
  it("tira do negócio a chave que o cadastro do cliente já define", () => {
    const doFunil = [cidade, { key: "placa", label: "Placa", type: "text" as const }];
    expect(camposDoNegocio(doFunil, [cidade]).map((c) => c.key)).toEqual(["placa"]);
  });

  it("sem campo do cliente, o funil fica como está", () => {
    const doFunil = [cidade];
    expect(camposDoNegocio(doFunil, [])).toBe(doFunil);
  });
});

describe("aplicarMudancas — o PATCH do contato substitui o objeto", () => {
  it("preserva as chaves que o bloco não renderizou", () => {
    const atual = { cidade: "Recife", outra_chave: 42 };
    expect(aplicarMudancas(atual, { cidade: "Natal" })).toEqual({
      cidade: "Natal",
      outra_chave: 42,
    });
  });

  it("campo limpo (null, como soChavesAlteradas devolve) sai do objeto", () => {
    expect(aplicarMudancas({ cidade: "Recife", sexo: "f" }, { cidade: null })).toEqual({
      sexo: "f",
    });
  });

  it("não muta o objeto atual", () => {
    const atual = { cidade: "Recife" };
    aplicarMudancas(atual, { cidade: "Natal" });
    expect(atual).toEqual({ cidade: "Recife" });
  });
});

describe("valorPreenchido", () => {
  it("vazio é ausente, texto em branco e lista vazia", () => {
    expect([undefined, null, "", "  ", []].map(valorPreenchido)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("zero e falso são valor declarado", () => {
    expect([0, false, "x", ["a"]].map(valorPreenchido)).toEqual([true, true, true, true]);
  });
});
