import { describe, expect, it } from "vitest";

import { LlmNotConfiguredError } from "@/lib/agent-engine/edge/llm/credentials";
import { DETALHE_TECNICO } from "@/lib/event-log/aviso-de-evento-morto";
import { IA_SEM_CHAVE, avisoDeIaSemChave, ehFaltaDeChaveDeIa } from "@/lib/event-log/ia-sem-chave";

describe("ehFaltaDeChaveDeIa — o motivo 'não há chave' atravessa as camadas", () => {
  it("reconhece o erro tipado", () => {
    expect(ehFaltaDeChaveDeIa(new LlmNotConfiguredError())).toBe(true);
  });

  it("reconhece a mensagem guardada como texto (last_error, motivo do dreno)", () => {
    expect(ehFaltaDeChaveDeIa(new LlmNotConfiguredError().message)).toBe(true);
    expect(ehFaltaDeChaveDeIa(`media-derive: ${new LlmNotConfiguredError().message}`)).toBe(true);
  });

  it("reconhece o erro embrulhado que preserva o name", () => {
    const embrulhado = Object.assign(new Error("turno falhou"), { name: "llm_not_configured" });
    expect(ehFaltaDeChaveDeIa(embrulhado)).toBe(true);
  });

  it("NÃO confunde falha de verdade com falta de configuração", () => {
    for (const outro of [
      new Error("The model `claude-sonnet-5` does not exist or you do not have access to it"),
      new Error("storage_download_failed: no_data"),
      "timeout",
      null,
      undefined,
      42,
    ]) {
      expect(ehFaltaDeChaveDeIa(outro), String(outro)).toBe(false);
    }
  });
});

describe("avisoDeIaSemChave — texto para quem opera, técnico no fim", () => {
  it("título fixo (é a chave do dedupe no índice único do banco)", () => {
    expect(avisoDeIaSemChave().title).toBe(IA_SEM_CHAVE.titulo);
    expect(avisoDeIaSemChave("qualquer coisa").title).toBe(IA_SEM_CHAVE.titulo);
  });

  it("começa pelo que fazer, e o detalhe técnico vem depois do rótulo", () => {
    const { body } = avisoDeIaSemChave(new LlmNotConfiguredError().message);
    expect(body.startsWith("Enquanto não houver uma chave")).toBe(true);
    expect(body).toMatch(/Credenciais/);
    expect(body).toMatch(/desligarem a IA desta empresa/);
    const i = body.indexOf(DETALHE_TECNICO);
    expect(i).toBeGreaterThan(0);
    expect(body.indexOf("ai_provider_credentials")).toBeGreaterThan(i);
  });

  it("sem detalhe, sem o rótulo técnico", () => {
    expect(avisoDeIaSemChave().body).not.toContain(DETALHE_TECNICO);
  });
});
