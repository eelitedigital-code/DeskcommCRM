"use client";

/**
 * Dashboard de Atendimento (Spec 04, fork Elite) — a casca da tela.
 *
 * Tudo o que aparece vem pronto de `GET /api/v1/painel/atendimento`: a tela só
 * desenha. Quem vê o quê é decidido no servidor (D2); aqui só se escolhe o
 * que mostrar quando o bloco veio `null` (IA desligada, canal de leads para
 * quem não é gerente).
 *
 * Ordem das faixas (§6): status de agora → por hora / por dia → IA x Pessoa e
 * fila → por número e por atendente → canal com mais leads.
 */
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { usePainelAtendimento, type FiltrosDoPainel } from "@/hooks/painel/usePainelAtendimento";
import type { Periodo } from "@/lib/painel-atendimento/periodo";

import { AjustarRegua } from "./AjustarRegua";
import { CanaisDeLeads } from "./CanaisDeLeads";
import { CartoesDoStatus } from "./CartoesDoStatus";
import { GraficoPorDia, GraficoPorHora } from "./Graficos";
import { FilaPorEspera, IaXPessoa, TabelaPorAtendente, TabelaPorNumero } from "./Quadros";

const TODOS = "__todos__";

interface Props {
  gerente: boolean;
  userId: string;
}

function inicioDoDiaLocal(data: string): string {
  return new Date(`${data}T00:00:00`).toISOString();
}
function fimDoDiaLocal(data: string): string {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function AtualizadoHa({ quando }: { quando: string }) {
  const t = useT();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((agora - new Date(quando).getTime()) / 1000));
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" aria-live="off">
      <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
      {t("Atualizado há")} {s} s
    </span>
  );
}

export function PainelClient({ gerente, userId }: Props) {
  const t = useT();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [numero, setNumero] = useState<string>(TODOS);
  const [atendente, setAtendente] = useState<string>(TODOS);

  const filtros: FiltrosDoPainel = useMemo(
    () => ({
      periodo,
      de: periodo === "personalizado" && de ? inicioDoDiaLocal(de) : null,
      ate: periodo === "personalizado" && ate ? fimDoDiaLocal(ate) : null,
      numero: numero === TODOS ? null : numero,
      atendente: atendente === TODOS ? null : atendente,
    }),
    [periodo, de, ate, numero, atendente],
  );

  const { data, isLoading, isError } = usePainelAtendimento(filtros);
  const painel = data?.data;

  // As opções dos filtros saem da leitura SEM os filtros de número e de
  // atendente: escolhido um número, a lista não pode encolher para ele só.
  // Sem filtro ativo, as duas leituras têm a MESMA chave e o react-query faz
  // uma só.
  const { data: dataBase } = usePainelAtendimento({ ...filtros, numero: null, atendente: null });
  const base = dataBase?.data;
  const opcoesDeNumero = useMemo(
    () =>
      (base?.por_numero ?? []).map((n) => ({
        id: n.channel_session_id,
        nome: n.nome ?? `${t("Número")} ${n.channel_session_id.slice(0, 8)}`,
      })),
    [base, t],
  );
  const opcoesDeAtendente = useMemo(
    () =>
      gerente
        ? (base?.por_atendente ?? [])
            .filter((a) => a.quem === "humano" && a.user_id)
            .map((a) => ({ id: a.user_id as string, nome: a.nome ?? t("Sem nome") }))
        : [],
    [base, gerente, t],
  );

  const personalizadoIncompleto = periodo === "personalizado" && !(de && ate);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Dashboard")}</h1>
          <p className="text-sm text-muted-foreground">{t("Atendimento por WhatsApp · visão geral da empresa")}</p>
        </div>
        <div className="flex items-center gap-3">
          {painel ? <AtualizadoHa quando={painel.atualizado_em} /> : null}
          {gerente && painel ? <AjustarRegua /> : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Filtros do painel")}>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[150px]" aria-label={t("Período")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">{t("Hoje")}</SelectItem>
            <SelectItem value="7d">{t("7 dias")}</SelectItem>
            <SelectItem value="30d">{t("30 dias")}</SelectItem>
            <SelectItem value="personalizado">{t("Personalizado")}</SelectItem>
          </SelectContent>
        </Select>
        {periodo === "personalizado" ? (
          <>
            <Input type="date" className="w-[160px]" value={de} onChange={(e) => setDe(e.target.value)} aria-label={t("Início do período")} />
            <Input type="date" className="w-[160px]" value={ate} onChange={(e) => setAte(e.target.value)} aria-label={t("Fim do período")} />
          </>
        ) : null}
        <Select value={numero} onValueChange={setNumero}>
          <SelectTrigger className="w-[200px]" aria-label={t("Número de WhatsApp")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t("Todos os números")}</SelectItem>
            {opcoesDeNumero.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={atendente} onValueChange={setAtendente}>
          <SelectTrigger className="w-[200px]" aria-label={t("Atendente")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t("Todos os atendentes")}</SelectItem>
            {gerente ? (
              opcoesDeAtendente.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
              ))
            ) : (
              <SelectItem value={userId}>{t("Só os meus atendimentos")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {personalizadoIncompleto ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("Escolha o início e o fim do período.")}
          </CardContent>
        </Card>
      ) : isLoading && !painel ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError || !painel ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {t("Não foi possível carregar o painel. Tente de novo em instantes.")}
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-labelledby="faixa-status" className="flex flex-col gap-3">
            <h2 id="faixa-status" className="text-sm font-medium text-muted-foreground">{t("Status da operação agora")}</h2>
            <CartoesDoStatus painel={painel} />
          </section>

          {painel.aviso_sem_janela ? (
            <p className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              {t("Há número sem janela de resposta configurada: nele o tempo de resposta conta 24 horas. Ajuste a janela em Conexões.")}
            </p>
          ) : null}

          {painel.vazio ? (
            <Card data-testid="painel-vazio">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("Nenhuma mensagem neste período. Escolha outro período ou outro número.")}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <GraficoPorHora painel={painel} />
                <GraficoPorDia painel={painel} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {painel.ia_x_pessoa ? <IaXPessoa painel={painel} /> : null}
                <FilaPorEspera painel={painel} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <TabelaPorNumero painel={painel} />
                <TabelaPorAtendente painel={painel} gerente={gerente} />
              </div>
            </>
          )}

          {painel.canais_de_leads ? <CanaisDeLeads quadro={painel.canais_de_leads} /> : null}
        </>
      )}
    </div>
  );
}
