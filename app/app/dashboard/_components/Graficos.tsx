"use client";

/**
 * Faixa 2 (§6): "Mensagens por hora do dia" (recebidas e enviadas, pico em
 * destaque) e "Tempo médio de resposta por dia" (14 dias, linha tracejada no
 * limite esperado, barras acima dele em âmbar).
 *
 * Cores: lidas dos tokens do tema (`--color-*`) no navegador, e relidas quando
 * o tema muda — SVG não herda a classe do Tailwind, e um hex fixo aqui
 * desmontaria o tema claro ou o escuro.
 */
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { RespostaDoPainel } from "@/hooks/painel/usePainelAtendimento";
import { formatarDuracao, rotuloDaHora } from "@/lib/painel-atendimento/formato";

interface Cores {
  primaria: string;
  secundaria: string;
  alerta: string;
  borda: string;
  texto: string;
}

const PADRAO: Cores = { primaria: "#007c1f", secundaria: "#4a7a93", alerta: "#b07a2b", borda: "#d4d4d4", texto: "#737373" };

function useCoresDoTema(): Cores {
  const [cores, setCores] = useState<Cores>(PADRAO);
  useEffect(() => {
    const ler = () => {
      const css = getComputedStyle(document.documentElement);
      const v = (nome: string, padrao: string) => css.getPropertyValue(nome).trim() || padrao;
      setCores({
        primaria: v("--color-primary", PADRAO.primaria),
        secundaria: v("--color-info", PADRAO.secundaria),
        alerta: v("--color-warning", PADRAO.alerta),
        borda: v("--color-border", PADRAO.borda),
        texto: v("--color-muted-foreground", PADRAO.texto),
      });
    };
    ler();
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => obs.disconnect();
  }, []);
  return cores;
}

const estiloDaDica = {
  borderRadius: "8px",
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  color: "var(--color-card-foreground)",
  fontSize: 12,
};

export function GraficoPorHora({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const cores = useCoresDoTema();
  const dados = painel.por_hora.map((h) => ({ ...h, rotulo: rotuloDaHora(h.hora) }));
  const pico = dados.reduce((m, h) => (h.recebidas > m.recebidas ? h : m), dados[0] ?? { hora: -1, recebidas: 0 });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Mensagens por hora do dia")}</CardTitle>
        {pico && pico.recebidas > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("Pico")}: {rotuloDaHora(pico.hora)} · {pico.recebidas} {t("recebidas")}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="h-[220px]" role="img" aria-label={t("Mensagens recebidas e enviadas por hora do dia")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cores.borda} vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: cores.texto }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cores.texto }} />
              <Tooltip contentStyle={estiloDaDica} />
              <Bar dataKey="recebidas" name={t("Recebidas")} fill={cores.primaria} radius={[3, 3, 0, 0]}>
                {dados.map((h) => (
                  <Cell key={h.hora} fillOpacity={h.hora === pico?.hora ? 1 : 0.55} />
                ))}
              </Bar>
              <Bar dataKey="enviadas" name={t("Enviadas")} fill={cores.secundaria} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: cores.primaria }} aria-hidden="true" />
            {t("Recebidas")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: cores.secundaria }} aria-hidden="true" />
            {t("Enviadas")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function GraficoPorDia({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const cores = useCoresDoTema();
  const limite = painel.configuracao.limiares.resposta_esperado_min * 60;
  const dados = painel.por_dia.map((d) => ({
    ...d,
    rotulo: new Date(`${d.dia}T12:00:00Z`).toLocaleDateString(idioma, { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
    valor: d.media_s ?? 0,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Tempo médio de resposta por dia")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("Últimos 14 dias · linha tracejada: dentro do esperado até")} {painel.configuracao.limiares.resposta_esperado_min} min
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]" role="img" aria-label={t("Tempo médio de resposta nos últimos 14 dias")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cores.borda} vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: cores.texto }} interval={1} />
              <YAxis tickFormatter={(v: number) => formatarDuracao(v)} tick={{ fontSize: 11, fill: cores.texto }} width={64} />
              <Tooltip
                contentStyle={estiloDaDica}
                formatter={(v, _n, item) => [
                  (item as { payload?: { pares?: number } } | undefined)?.payload?.pares
                    ? formatarDuracao(Number(v))
                    : t("Sem resposta medida"),
                  t("Tempo médio"),
                ]}
              />
              <ReferenceLine y={limite} stroke={cores.alerta} strokeDasharray="5 4" />
              <Bar dataKey="valor" name={t("Tempo médio")} radius={[3, 3, 0, 0]}>
                {dados.map((d) => (
                  <Cell key={d.dia} fill={d.valor > limite ? cores.alerta : cores.primaria} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
