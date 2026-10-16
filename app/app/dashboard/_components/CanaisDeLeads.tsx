"use client";

/**
 * Faixa 5 — "Canal com mais leads" (D9, §6). Só chega para gerente+ (o
 * servidor manda `null` aos demais). Contatos novos no período por origem; o
 * líder aparece como ícone, os nomes ficam nas barras. Os rótulos e o
 * agrupamento já vêm prontos do servidor (`lib/painel-atendimento/origens.ts`).
 */
import { IconeDoCanal } from "@/components/painel/IconeDoCanal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { formatarVariacao } from "@/lib/painel-atendimento/formato";
import type { QuadroDeCanais } from "@/lib/painel-atendimento/origens";

export function CanaisDeLeads({ quadro }: { quadro: QuadroDeCanais }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const lider = quadro.lider;
  const variacao = formatarVariacao(quadro.variacao);
  const maior = Math.max(1, ...quadro.canais.map((c) => c.atual));

  return (
    <Card data-testid="canal-com-mais-leads">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Canal com mais leads")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("Contatos novos no período, pela origem gravada no contato")}</p>
      </CardHeader>
      <CardContent>
        {quadro.total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhum contato novo no período.")}</p>
        ) : (
          <div className="flex flex-col gap-6 md:flex-row">
            <div className="flex shrink-0 flex-col items-center gap-2 md:w-48">
              {lider ? (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary"
                  title={lider.rotulo}
                >
                  <IconeDoCanal icone={lider.icone} tamanho={40} />
                  <span className="sr-only">{lider.rotulo}</span>
                </div>
              ) : null}
              <span className="text-3xl font-semibold tabular-nums">{quadro.total.toLocaleString(idioma)}</span>
              <span className="text-xs text-muted-foreground">{t("leads no período")}</span>
              {lider ? (
                <span className="text-xs text-muted-foreground">
                  {Math.round(lider.percentual)}% {t("do total vêm do canal líder")}
                </span>
              ) : null}
              {variacao ? (
                <span className="text-xs text-muted-foreground">
                  {variacao} {t("vs. período anterior")}
                </span>
              ) : null}
            </div>
            <ul className="flex flex-1 flex-col gap-3" aria-label={t("Leads por canal")}>
              {quadro.canais.map((c) => (
                <li key={c.chave} className="flex items-center gap-3 text-sm">
                  <IconeDoCanal icone={c.icone} tamanho={18} className="shrink-0 text-muted-foreground" />
                  <span className="w-48 shrink-0 truncate" title={c.rotulo}>
                    {c.rotulo}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${(c.atual / maior) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {c.atual.toLocaleString(idioma)} · {Math.round(c.percentual)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
