import { describe, expect, it } from "vitest";

import {
  CAMPOS_PRONTOS,
  comCampoPronto,
  gruposDosCamposProntos,
} from "@/lib/contacts/campos-prontos";
import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";

describe("catálogo de campos prontos", () => {
  it("todo campo pronto passa no MESMO schema que a action de gravar usa", () => {
    for (const p of CAMPOS_PRONTOS) {
      const r = customFieldSchema.safeParse(p.campo);
      expect(r.success, `${p.campo.key}: ${r.success ? "" : r.error.issues[0]?.message}`).toBe(
        true,
      );
    }
  });

  it("as chaves não se repetem — cada uma é o endereço do valor em todos os contatos", () => {
    const chaves = CAMPOS_PRONTOS.map((p) => p.campo.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("lista fechada sempre chega com opções", () => {
    for (const p of CAMPOS_PRONTOS) {
      if (p.campo.type === "select" || p.campo.type === "multiselect") {
        expect(p.campo.options?.length ?? 0, p.campo.key).toBeGreaterThan(0);
      }
    }
  });

  it("estado traz as 27 UFs", () => {
    const estado = CAMPOS_PRONTOS.find((p) => p.campo.key === "estado")!;
    expect(estado.campo.options).toHaveLength(27);
  });

  it("os grupos saem na ordem do catálogo, sem repetir", () => {
    expect(gruposDosCamposProntos()[0]).toBe(CAMPOS_PRONTOS[0]!.grupo);
    expect(new Set(gruposDosCamposProntos()).size).toBe(gruposDosCamposProntos().length);
  });
});

describe("comCampoPronto", () => {
  const sexo = CAMPOS_PRONTOS.find((p) => p.campo.key === "sexo")!;
  const proprio: CustomFieldDef = { key: "placa", label: "Placa do carro", type: "text" };

  it("ligar acrescenta no fim sem mexer nos campos próprios", () => {
    expect(comCampoPronto([proprio], sexo, true).map((c) => c.key)).toEqual(["placa", "sexo"]);
  });

  it("desligar tira só ele", () => {
    const ligado = comCampoPronto([proprio], sexo, true);
    expect(comCampoPronto(ligado, sexo, false)).toEqual([proprio]);
  });

  it("ligar duas vezes não duplica", () => {
    const duas = comCampoPronto(comCampoPronto([], sexo, true), sexo, true);
    expect(duas.filter((c) => c.key === "sexo")).toHaveLength(1);
  });

  it("não devolve o objeto do catálogo (editar depois não altera o catálogo)", () => {
    const [copia] = comCampoPronto([], sexo, true);
    expect(copia).not.toBe(sexo.campo);
  });
});
