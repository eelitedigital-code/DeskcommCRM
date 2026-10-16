import { describe, expect, it } from "vitest";

import { janelaDoPeriodo } from "./periodo";

describe("janelaDoPeriodo", () => {
  it("'hoje' começa à meia-noite de Brasília, mesmo quando o dia UTC já virou", () => {
    // 23:30 de 13/07 em Brasília = 02:30 UTC de 14/07
    const agora = new Date("2026-07-14T02:30:00Z");
    const j = janelaDoPeriodo("hoje", { fuso: "America/Sao_Paulo", agora });
    expect(j.ok && j.de.toISOString()).toBe("2026-07-13T03:00:00.000Z");
    expect(j.ok && j.ate.toISOString()).toBe(agora.toISOString());
  });

  it("fuso inválido cai no padrão do produto", () => {
    const agora = new Date("2026-07-14T02:30:00Z");
    const j = janelaDoPeriodo("hoje", { fuso: "America/Asunción", agora });
    expect(j.ok && j.de.toISOString()).toBe("2026-07-13T03:00:00.000Z");
  });

  it("7 e 30 dias contam para trás a partir de agora", () => {
    const agora = new Date("2026-07-31T12:00:00Z");
    const j7 = janelaDoPeriodo("7d", { agora });
    const j30 = janelaDoPeriodo("30d", { agora });
    expect(j7.ok && j7.de.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(j30.ok && j30.de.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  it("personalizado exige as duas datas, em ordem, com até 92 dias", () => {
    expect(janelaDoPeriodo("personalizado", {})).toEqual({ ok: false, motivo: "faltam_datas" });
    expect(janelaDoPeriodo("personalizado", { de: "2026-07-02T00:00:00Z", ate: "2026-07-01T00:00:00Z" }))
      .toEqual({ ok: false, motivo: "invertida" });
    expect(janelaDoPeriodo("personalizado", { de: "2026-01-01T00:00:00Z", ate: "2026-07-01T00:00:00Z" }))
      .toEqual({ ok: false, motivo: "longa_demais" });
    expect(janelaDoPeriodo("personalizado", { de: "2026-06-01T00:00:00Z", ate: "2026-07-01T00:00:00Z" }).ok).toBe(true);
  });
});
