"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { CustomFieldDef } from "@/lib/schemas/settings";

export const CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE = ["campos-do-cliente"] as const;

/**
 * As definições dos campos do cliente da organização ativa
 * (`organizations.settings.contact_fields`). Lidas pela ficha do contato, pelo
 * painel da conversa e pelo dossiê do negócio — o mesmo conjunto nos três, que
 * é o ponto de as definições não morarem mais no funil.
 */
export function useCamposDoCliente(enabled = true) {
  return useQuery({
    queryKey: CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomFieldDef[]> => {
      const res = await apiClient.get<{ data: { fields: CustomFieldDef[] } }>(
        "/api/v1/contact-fields",
      );
      return res.data.fields;
    },
  });
}
