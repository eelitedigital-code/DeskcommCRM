"use client";

/**
 * VENDAS DA EMPRESA — o que todas as pessoas da equipe fecharam, inclusive quem
 * saiu e quem foi anonimizado (a venda fica; a identidade some conforme o caso).
 * Os números vêm prontos do servidor (`GET /api/v1/companies/[id]/vendas`).
 *
 * Sem ticket médio, conversão ou ciclo — mesma régua do painel do contato:
 * isto é visão macro, análise fica em Análise.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";

import { cargoEFinal } from "@/components/companies/EquipeDaEmpresa";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { MOEDA_PADRAO, formatSomaPorMoeda, formatValorDoNegocio } from "@/lib/money";
import { rotuloDoMotivoDePerda } from "@/lib/schemas/leads";

interface Quem {
  situacao: "ativo" | "saiu" | "anonimizado";
  nome: string | null;
  cargo: string | null;
  final_do_numero: string | null;
  contact_id: string | null;
}

interface Venda {
  id: string;
  /** Nulo quando quem comprou foi anonimizado (LGPD). */
  title: string | null;
  status: "open" | "won" | "lost";
  value_cents: number | null;
  currency: string | null;
  created_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  pipeline_id: string | null;
  funil_nome: string | null;
  etapa_nome: string | null;
  quem: Quem;
}

interface Resposta {
  resumo: {
    total_comprado: Array<{ currency: string; cents: number }>;
    abertos: number;
    ganhos: number;
    perdidos: number;
    cliente_desde: string | null;
    equipe: { ativos: number; sairam: number };
  };
  negocios: Venda[];
}

export const chaveDasVendas = (companyId: string) => ["empresa-vendas", companyId] as const;

export function VendasDaEmpresa({ companyId }: { companyId: string }) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const moedaDaOrg = useActiveOrg()?.currency ?? MOEDA_PADRAO;
  const q = useQuery({
    queryKey: chaveDasVendas(companyId),
    queryFn: async () =>
      (await apiClient.get<{ data: Resposta }>(`/api/v1/companies/${companyId}/vendas`)).data,
  });

  if (q.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Card className="p-4 text-sm text-error-fg">{t("Não foi possível carregar as vendas.")}</Card>
    );
  }

  const { resumo, negocios } = q.data;
  const data = (iso: string) => format(new Date(iso), "dd/MM/yyyy", { locale: localeDaData });
  const valor = (cents: number | null, moeda: string | null) =>
    cents == null ? "—" : formatValorDoNegocio(cents, moeda ?? moedaDaOrg);
  const total =
    formatSomaPorMoeda(
      new Map(resumo.total_comprado.map((m) => [m.currency, m.cents])),
      (cents, moeda) => formatValorDoNegocio(cents, moeda),
      { primeira: moedaDaOrg },
    ) || valor(0, moedaDaOrg);
  const rotuloDoStatus = (s: Venda["status"]) =>
    s === "won" ? t("Ganho") : s === "lost" ? t("Perdido") : t("Aberto");

  /** A coluna "quem comprou" nas três formas (ativo / saiu / anonimizado). */
  function quemComprou(q: Quem) {
    if (q.situacao === "anonimizado")
      return <span className="text-muted-foreground">{t("Anonimizado (LGPD)")}</span>;
    const resto = cargoEFinal(q.cargo, q.final_do_numero);
    if (q.situacao === "saiu") {
      return (
        <span>
          {resto || t("Ex-integrante")}{" "}
          <span className="text-xs text-muted-foreground">({t("saiu da empresa")})</span>
        </span>
      );
    }
    return (
      <span>
        {q.contact_id ? (
          <Link href={`/app/contacts/${q.contact_id}`} className="font-medium hover:underline">
            {q.nome ?? t("Contato")}
          </Link>
        ) : (
          <span className="font-medium">{q.nome ?? t("Contato")}</span>
        )}
        {resto && <span className="text-muted-foreground"> · {resto}</span>}
      </span>
    );
  }

  return (
    <Card className="space-y-4 p-4" data-testid="vendas-da-empresa">
      <h2 className="font-medium">{t("Vendas da empresa")}</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t("Total comprado")}</dt>
          <dd className="mt-1 text-base font-semibold" data-testid="vendas-total">
            {total}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Negócios")}</dt>
          <dd className="mt-1" data-testid="vendas-contagem">
            {resumo.abertos} {resumo.abertos === 1 ? t("aberto") : t("abertos")} · {resumo.ganhos}{" "}
            {resumo.ganhos === 1 ? t("ganho") : t("ganhos")} · {resumo.perdidos}{" "}
            {resumo.perdidos === 1 ? t("perdido") : t("perdidos")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Pessoas na equipe")}</dt>
          <dd className="mt-1" data-testid="vendas-equipe">
            {resumo.equipe.ativos}
            {resumo.equipe.sairam > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {resumo.equipe.sairam} {resumo.equipe.sairam === 1 ? t("saiu") : t("saíram")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Cliente desde")}</dt>
          <dd className="mt-1">{resumo.cliente_desde ? data(resumo.cliente_desde) : "—"}</dd>
        </div>
      </dl>

      {negocios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum negócio ainda. As vendas entram aqui pelos contatos da equipe.")}
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm" data-testid="vendas-lista">
          {negocios.map((n) => (
            <li key={n.id} className="space-y-1 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">{quemComprou(n.quem)}</div>
                <Badge
                  variant={
                    n.status === "won" ? "success" : n.status === "lost" ? "error" : "neutral"
                  }
                  className="shrink-0"
                >
                  {rotuloDoStatus(n.status)}
                </Badge>
              </div>
              {n.quem.situacao === "anonimizado" ? (
                // LGPD: só valor, situação e data. O título do negócio pode
                // carregar o nome do titular, e funil/etapa não acrescentam nada.
                <p className="text-xs text-muted-foreground">
                  {valor(n.value_cents, n.currency)} · {data(n.closed_at ?? n.created_at)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {[
                    valor(n.value_cents, n.currency),
                    n.funil_nome,
                    n.etapa_nome,
                    data(n.closed_at ?? n.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  ·{" "}
                  <Link
                    href={`/app/pipelines/${n.pipeline_id}?lead=${n.id}`}
                    className="hover:underline"
                  >
                    {n.title}
                  </Link>
                </p>
              )}
              {n.status === "lost" && n.lost_reason && n.quem.situacao !== "anonimizado" && (
                <p className="text-xs text-error-fg">
                  {t("Motivo:")} {t(rotuloDoMotivoDePerda(n.lost_reason))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
