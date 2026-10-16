"use client";

/**
 * A EMPRESA do contato, na Visão geral: em que equipe ele está e com que cargo,
 * com link para a ficha da empresa. Só aparece com a capacidade `empresas`
 * ligada; desligada, nada de empresa aparece na ficha (nada é apagado).
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

interface EmpresaDoContatoRow {
  vinculo_id: string;
  company_id: string | null;
  empresa: string | null;
  cargo: string | null;
  is_decision_maker: boolean;
}

export function EmpresaDoContato({ contactId }: { contactId: string }) {
  const t = useT();
  const ligado = useActiveOrg()?.capacidades_ligadas?.includes("empresas") ?? false;
  const q = useQuery({
    queryKey: ["contato-empresas", contactId],
    enabled: ligado,
    queryFn: async () =>
      (
        await apiClient.get<{ data: EmpresaDoContatoRow[] }>(
          `/api/v1/contacts/${contactId}/empresas`,
        )
      ).data,
  });
  if (!ligado || !q.data || q.data.length === 0) return null;

  return (
    <div data-testid="empresa-do-contato">
      <dt className="text-xs text-muted-foreground uppercase">{t("Empresa")}</dt>
      <dd className="mt-1 space-y-1">
        {q.data.map((e) => (
          <div key={e.vinculo_id}>
            {e.company_id ? (
              <Link href={`/app/companies/${e.company_id}`} className="font-medium hover:underline">
                {e.empresa ?? t("Empresa")}
              </Link>
            ) : (
              <span className="font-medium">{e.empresa ?? t("Empresa")}</span>
            )}
            {e.cargo && <span className="text-muted-foreground"> · {e.cargo}</span>}
            {e.is_decision_maker && (
              <span className="text-xs text-muted-foreground"> · {t("decide a compra")}</span>
            )}
          </div>
        ))}
      </dd>
    </div>
  );
}
