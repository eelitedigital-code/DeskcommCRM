"use client";
/**
 * Os dados do Dashboard de Atendimento (Spec 04).
 *
 * "Tempo real" aqui é uma releitura leve (D4), não uma conexão aberta por
 * aba: a cada 45 s, e só com a aba VISÍVEL — o react-query não repete o
 * intervalo em segundo plano (`refetchIntervalInBackground: false`) e relê
 * quando a aba volta ao foco. O servidor guarda o resultado por 45 s por
 * empresa + filtros, então dez telas abertas fazem uma consulta por janela.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { ConfiguracaoDoPainel, PatchDaConfiguracao } from "@/lib/painel-atendimento/configuracao";
import type { Painel } from "@/lib/painel-atendimento/montar";
import type { Periodo } from "@/lib/painel-atendimento/periodo";

export const INTERVALO_DE_ATUALIZACAO_MS = 45_000;

export interface FiltrosDoPainel {
  periodo: Periodo;
  de?: string | null;
  ate?: string | null;
  numero?: string | null;
  atendente?: string | null;
}

export type RespostaDoPainel = Painel & {
  atualizado_em: string;
  filtros: { periodo: Periodo; numero: string | null; atendente: string | null };
};

function consulta(f: FiltrosDoPainel): string {
  const qs = new URLSearchParams({ periodo: f.periodo });
  if (f.periodo === "personalizado" && f.de && f.ate) {
    qs.set("de", f.de);
    qs.set("ate", f.ate);
  }
  if (f.numero) qs.set("numero", f.numero);
  if (f.atendente) qs.set("atendente", f.atendente);
  return qs.toString();
}

export function usePainelAtendimento(filtros: FiltrosDoPainel) {
  const pronto = filtros.periodo !== "personalizado" || Boolean(filtros.de && filtros.ate);
  return useQuery({
    queryKey: ["painel-atendimento", filtros],
    queryFn: async () =>
      apiClient.get<{ data: RespostaDoPainel }>(`/api/v1/painel/atendimento?${consulta(filtros)}`),
    enabled: pronto,
    refetchInterval: INTERVALO_DE_ATUALIZACAO_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useConfiguracaoDoPainel() {
  return useQuery({
    queryKey: ["painel-atendimento", "configuracao"],
    queryFn: async () =>
      apiClient.get<{ data: { configuracao: ConfiguracaoDoPainel; padrao: ConfiguracaoDoPainel } }>(
        "/api/v1/painel/atendimento/configuracao",
      ),
    staleTime: 60_000,
  });
}

export function useSalvarConfiguracaoDoPainel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PatchDaConfiguracao) =>
      apiClient.patch<{ data: { configuracao: ConfiguracaoDoPainel } }>("/api/v1/painel/atendimento/configuracao", patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["painel-atendimento"] });
    },
  });
}
