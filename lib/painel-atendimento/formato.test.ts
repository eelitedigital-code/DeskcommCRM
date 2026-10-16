import { describe, expect, it } from "vitest";

import { formatarDuracao, formatarVariacao, rotuloDaHora } from "./formato";

describe("formatarDuracao", () => {
  it("não medido é traço, nunca zero", () => {
    expect(formatarDuracao(null)).toBe("—");
    expect(formatarDuracao(undefined)).toBe("—");
    expect(formatarDuracao(Number.NaN)).toBe("—");
  });
  it("a maior unidade que faz sentido, com no máximo duas partes", () => {
    expect(formatarDuracao(30)).toBe("30 s");
    expect(formatarDuracao(310)).toBe("5 min");
    expect(formatarDuracao(3600)).toBe("1 h");
    expect(formatarDuracao(7500)).toBe("2 h 05 min");
    expect(formatarDuracao(57600)).toBe("16 h");
    expect(formatarDuracao(97200)).toBe("1 d 3 h");
    expect(formatarDuracao(172800)).toBe("2 d");
  });
});

describe("formatarVariacao", () => {
  it("com sinal; anterior zerado não escreve nada", () => {
    expect(formatarVariacao(12.4)).toBe("+12%");
    expect(formatarVariacao(-30)).toBe("-30%");
    expect(formatarVariacao(0)).toBe("0%");
    expect(formatarVariacao(null)).toBeNull();
  });
});

describe("rotuloDaHora", () => {
  it("hora cheia", () => {
    expect(rotuloDaHora(9)).toBe("9h");
  });
});
