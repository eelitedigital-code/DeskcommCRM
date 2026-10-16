"use client";

/**
 * NEGÓCIOS DO CONTATO — o lado comercial do cliente na Visão geral da ficha.
 * Só leitura: o valor de cada negócio continua sendo editado no funil (D4).
 *
 * Quatro números e a lista. Ticket médio, taxa de conversão e ciclo médio ficam
 * FORA de propósito (D6): são análise, e análise tem casa em Análise.
 *
 * Os números vêm prontos do servidor (`GET /api/v1/contacts/[id]/negocios`),
 * calculados sobre TODOS os negócios — nunca somados aqui a partir da página
 * da lista, que é paginada.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { MOEDA_PADRAO, formatSomaPorMoeda, formatValorDoNegocio } from "@/lib/money";
import { rotuloDoMotivoDePerda } from "@/lib/schemas/leads";

interface Negocio {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  value_cents: number | null;
  currency: string | null;
  created_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  pipeline_id: string;
  funil_nome: string | null;
  funil_arquivado: boolean;
  etapa_nome: string | null;
  responsavel: { tipo: "ia" | "pessoa"; nome: string | null } | null;
}

interface Resposta {
  data: {
    resumo: {
      total_ganho: Array<{ currency: string; cents: number }>;
      abertos: number;
      ganhos: number;
      perdidos: number;
      cliente_desde: string | null;
      ultimo_negocio: {
        created_at: string;
        value_cents: number | null;
        currency: string | null;
      } | null;
    };
    negocios: Negocio[];
  };
  meta?: { cursor?: string; has_more?: boolean };
}

export function NegociosDoContato({ contactId }: { contactId: string }) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const moedaDaOrg = useActiveOrg()?.currency ?? MOEDA_PADRAO;
  const q = useInfiniteQuery({
    queryKey: ["contact-negocios", contactId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return apiClient.get<Resposta>(`/api/v1/contacts/${contactId}/negocios?${params.toString()}`);
    },
    getNextPageParam: (ultima) => (ultima.meta?.has_more ? (ultima.meta.cursor ?? null) : null),
  });

  if (q.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Card className="p-4 text-sm text-error-fg">
        {t("Não foi possível carregar os negócios.")}
      </Card>
    );
  }

  const resumo = q.data.pages[0]!.data.resumo;
  const negocios = q.data.pages.flatMap((p) => p.data.negocios);
  const valor = (cents: number | null, moeda: string | null) =>
    cents == null ? "—" : formatValorDoNegocio(cents, moeda ?? moedaDaOrg);
  const data = (iso: string) => format(new Date(iso), "dd/MM/yyyy", { locale: localeDaData });
  const totalGanho = formatSomaPorMoeda(
    new Map(resumo.total_ganho.map((m) => [m.currency, m.cents])),
    (cents, moeda) => formatValorDoNegocio(cents, moeda),
    { primeira: moedaDaOrg },
  );
  const rotuloDoStatus = (s: Negocio["status"]) =>
    s === "won" ? t("Ganho") : s === "lost" ? t("Perdido") : t("Aberto");

  return (
    <Card className="space-y-4 p-4" data-testid="negocios-do-contato">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase">{t("Negócios")}</h3>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("Quanto já gastou")}</dt>
          <dd className="mt-1 text-base font-semibold" data-testid="negocios-total-ganho">
            {totalGanho || valor(0, moedaDaOrg)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Negócios")}</dt>
          <dd className="mt-1" data-testid="negocios-contagem">
            {resumo.abertos} {resumo.abertos === 1 ? t("aberto") : t("abertos")} · {resumo.ganhos}{" "}
            {resumo.ganhos === 1 ? t("ganho") : t("ganhos")} · {resumo.perdidos}{" "}
            {resumo.perdidos === 1 ? t("perdido") : t("perdidos")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Cliente desde")}</dt>
          <dd className="mt-1">{resumo.cliente_desde ? data(resumo.cliente_desde) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Último negócio")}</dt>
          <dd className="mt-1">
            {resumo.ultimo_negocio
              ? `${data(resumo.ultimo_negocio.created_at)} · ${valor(
                  resumo.ultimo_negocio.value_cents,
                  resumo.ultimo_negocio.currency,
                )}`
              : "—"}
          </dd>
        </div>
      </dl>

      {negocios.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Este cliente ainda não tem negócios.")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm" data-testid="negocios-lista">
          {negocios.map((n) => (
            <li key={n.id} className="space-y-1 py-2">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/app/pipelines/${n.pipeline_id}?lead=${n.id}`}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {n.title}
                </Link>
                <Badge
                  variant={
                    n.status === "won" ? "success" : n.status === "lost" ? "error" : "neutral"
                  }
                  className="shrink-0"
                >
                  {rotuloDoStatus(n.status)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {[
                  n.funil_nome
                    ? `${n.funil_nome}${n.funil_arquivado ? ` (${t("arquivado")})` : ""}`
                    : null,
                  n.etapa_nome,
                  valor(n.value_cents, n.currency),
                  n.responsavel
                    ? n.responsavel.tipo === "ia"
                      ? t("Agente de IA")
                      : (n.responsavel.nome ?? t("Atendente"))
                    : t("Sem responsável"),
                  data(n.closed_at ?? n.created_at),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {n.status === "lost" && n.lost_reason && (
                <p className="text-xs text-error-fg">
                  {t("Motivo:")} {t(rotuloDoMotivoDePerda(n.lost_reason))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {q.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {q.isFetchingNextPage ? t("Carregando…") : t("Ver mais negócios")}
        </Button>
      )}
    </Card>
  );
}
