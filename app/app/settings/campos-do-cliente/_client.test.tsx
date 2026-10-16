/**
 * A tela Campos do cliente: o interruptor de campo pronto grava na hora, a
 * partir da lista SALVA, e desligar não leva junto os campos próprios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/app/actions/settings/salvarCamposDoCliente", () => ({
  salvarCamposDoCliente: vi.fn(async () => ({ ok: true })),
}));

// Polyfills que o Radix exige e o jsdom não tem.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { salvarCamposDoCliente } from "@/app/actions/settings/salvarCamposDoCliente";
import type { CustomFieldDef } from "@/lib/schemas/settings";
import { CamposDoClienteClient } from "./_client";

const proprio: CustomFieldDef = { key: "placa", label: "Placa do carro", type: "text" };

function montar(campos: CustomFieldDef[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CamposDoClienteClient campos={campos} camposDosFunis={[]} />
    </QueryClientProvider>,
  );
}

const gravacoes = () =>
  vi
    .mocked(salvarCamposDoCliente)
    .mock.calls.map((c) => (c[0] as CustomFieldDef[]).map((f) => f.key));

describe("campos prontos", () => {
  beforeEach(() => vi.mocked(salvarCamposDoCliente).mockClear());

  it("ligar grava na hora, sem botão de salvar, e o interruptor fica ligado", async () => {
    montar([proprio]);
    const interruptor = screen.getByRole("switch", { name: "Ativar Estado" });
    expect(interruptor.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(interruptor);
    await waitFor(() => expect(gravacoes()).toEqual([["placa", "estado"]]));
    await waitFor(() => expect(interruptor.getAttribute("aria-checked")).toBe("true"));
  });

  it("desligar tira só ele e mantém o campo próprio", async () => {
    montar([
      proprio,
      { key: "sexo", label: "Sexo", type: "select", options: [{ value: "F", label: "F" }] },
    ]);
    const interruptor = screen.getByRole("switch", { name: "Ativar Sexo" });
    expect(interruptor.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(interruptor);
    await waitFor(() => expect(gravacoes()).toEqual([["placa"]]));
  });

  it("um rascunho pela metade no editor não vai junto com o interruptor", async () => {
    montar([proprio]);
    // Rascunho no editor: rótulo do campo próprio apagado (inválido para gravar).
    fireEvent.change(screen.getByLabelText("Rótulo do campo 1"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("switch", { name: "Ativar Cidade" }));
    await waitFor(() => expect(salvarCamposDoCliente).toHaveBeenCalledTimes(1));
    const gravado = vi.mocked(salvarCamposDoCliente).mock.calls[0]![0] as CustomFieldDef[];
    expect(gravado.find((c) => c.key === "placa")?.label).toBe("Placa do carro");
  });

  it("o seletor de tipo fala português", () => {
    montar([proprio]);
    expect(screen.getByLabelText("Tipo do campo 1").textContent).toContain("Texto curto");
  });
});
