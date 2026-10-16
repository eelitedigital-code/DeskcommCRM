"use client";

/**
 * Faixa 1 — "Status da operação agora" (§6): mensagens, tempo de resposta,
 * conversas ativas e espera acima do limite. O selo só aparece onde há régua
 * (tempo e espera); um selo sem régua seria enfeite.
 */
import { Card, CardContent } from "@/components/ui/card";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { RespostaDoPainel } from "@/hooks/painel/usePainelAtendimento";
import { formatarDuracao, formatarVariacao } from "@/lib/painel-atendimento/formato";
import type { Selo } from "@/lib/painel-atendimento/montar";

const ESTILO_DO_SELO: Record<Selo, string> = {
  esperado: "bg-success-bg text-success-fg",
  atencao: "bg-warning-bg text-warning-fg",
  critico: "bg-destructive/10 text-destructive",
};
const ROTULO_DO_SELO: Record<Selo, string> = {
  esperado: "Dentro do esperado",
  atencao: "Atenção",
  critico: "Crítico",
};

export function SeloDoPainel({ selo }: { selo: Selo | null }) {
  const t = useT();
  if (!selo) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_DO_SELO[selo]}`}>{t(ROTULO_DO_SELO[selo])}</span>
  );
}

function Variacao({ valor, menorEMelhor = false }: { valor: number | null; menorEMelhor?: boolean }) {
  const t = useT();
  const texto = formatarVariacao(valor);
  if (!texto || valor === null) return null;
  const bom = menorEMelhor ? valor < 0 : valor > 0;
  const cor = valor === 0 ? "text-muted-foreground" : bom ? "text-success-fg" : "text-warning-fg";
  return (
    <span className={`text-xs ${cor}`}>
      {texto} {t("vs. período anterior")}
    </span>
  );
}

function Cartao({
  titulo,
  selo,
  destaque,
  children,
}: {
  titulo: string;
  selo?: Selo | null;
  destaque: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground">{titulo}</span>
          <SeloDoPainel selo={selo ?? null} />
        </div>
        <span className="text-3xl font-semibold tabular-nums">{destaque}</span>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

export function CartoesDoStatus({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const n = (v: number) => v.toLocaleString(idioma);
  const c = painel.cartoes;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao titulo={t("Mensagens recebidas")} destaque={n(c.mensagens.recebidas)}>
        <span>
          {n(c.mensagens.enviadas)} {t("enviadas")}
        </span>
        <Variacao valor={c.mensagens.variacao_recebidas} />
      </Cartao>

      <Cartao titulo={t("Tempo médio de resposta")} selo={c.tempo_de_resposta.selo} destaque={formatarDuracao(c.tempo_de_resposta.media_s)}>
        <span>
          {t("Mediana")}: {formatarDuracao(c.tempo_de_resposta.mediana_s)} · {t("1ª resposta")}: {formatarDuracao(c.tempo_de_resposta.primeira_resposta_s)}
        </span>
        <Variacao valor={c.tempo_de_resposta.variacao_media} menorEMelhor />
      </Cartao>

      <Cartao titulo={t("Conversas ativas agora")} destaque={n(c.conversas.ativas)}>
        <span>
          {n(c.conversas.aguardando)} {t("aguardando resposta")}
        </span>
      </Cartao>

      <Cartao titulo={t("Espera acima do limite")} selo={c.espera.selo} destaque={n(c.espera.acima_do_limite)}>
        <span>
          {t("Limite")}: {c.espera.limite_min} min
        </span>
      </Cartao>
    </div>
  );
}
