"use client";

/**
 * Faixas 3 e 4 (§6):
 *   - "IA x Pessoa": barra dividida, contagem e tempo médio de cada lado. O
 *     servidor manda `null` com a IA desligada, e aí o bloco nem é montado.
 *   - "Fila agora, por tempo de espera": três barras, sem nome de cliente.
 *   - "Por número de WhatsApp" e "Por atendente": aguardando em âmbar a
 *     partir de 3. Em "Por atendente" a IA é linha própria; o atendente recebe
 *     do servidor só a própria linha (D2).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { RespostaDoPainel } from "@/hooks/painel/usePainelAtendimento";
import { formatarDuracao } from "@/lib/painel-atendimento/formato";

const AGUARDANDO_EM_ALERTA = 3;

function Aguardando({ n }: { n: number }) {
  return <span className={n >= AGUARDANDO_EM_ALERTA ? "font-medium text-warning-fg" : undefined}>{n}</span>;
}

export function IaXPessoa({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const bloco = painel.ia_x_pessoa;
  if (!bloco) return null;
  const total = bloco.ia.pares + bloco.pessoa.pares;
  const pctIa = total > 0 ? Math.round((bloco.ia.pares / total) * 100) : 0;

  return (
    <Card data-testid="ia-x-pessoa">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("IA x Pessoa")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("Quem respondeu o cliente no período")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhuma resposta no período.")}</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t("IA")} ${pctIa}% · ${t("Pessoa")} ${100 - pctIa}%`}>
              <div className="h-full bg-info" style={{ width: `${pctIa}%` }} />
              <div className="h-full bg-primary" style={{ width: `${100 - pctIa}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-info" aria-hidden="true" />
                  {t("IA")} · {pctIa}%
                </span>
                <span className="text-xl font-semibold tabular-nums">{bloco.ia.pares}</span>
                <span className="text-xs text-muted-foreground">
                  {t("Tempo médio")}: {formatarDuracao(bloco.ia.media_s)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  {t("Pessoa")} · {100 - pctIa}%
                </span>
                <span className="text-xl font-semibold tabular-nums">{bloco.pessoa.pares}</span>
                <span className="text-xs text-muted-foreground">
                  {t("Tempo médio")}: {formatarDuracao(bloco.pessoa.media_s)}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function FilaPorEspera({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const f = painel.fila;
  const faixas = [
    { rotulo: t("Até 5 min"), n: f.ate_5_min, cor: "bg-success" },
    { rotulo: t("5 a 15 min"), n: f.de_5_a_15_min, cor: "bg-warning" },
    { rotulo: t("Mais de 15 min"), n: f.acima_de_15_min, cor: "bg-destructive" },
  ];
  const maior = Math.max(1, ...faixas.map((x) => x.n));
  const total = faixas.reduce((s, x) => s + x.n, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Fila agora, por tempo de espera")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? t("conversa aguardando resposta") : t("conversas aguardando resposta")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {faixas.map((x) => (
          <div key={x.rotulo} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-muted-foreground">{x.rotulo}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${x.cor}`} style={{ width: `${(x.n / maior) * 100}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums">{x.n}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TabelaPorNumero({ painel }: { painel: RespostaDoPainel }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const linhas = painel.por_numero;

  return (
    <Card data-testid="por-numero">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Por número de WhatsApp")}</CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Sem atividade no período.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Número")}</TableHead>
                <TableHead className="text-right">{t("Mensagens")}</TableHead>
                <TableHead className="text-right">{t("Tempo médio")}</TableHead>
                <TableHead className="text-right">{t("Aguardando")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.channel_session_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{l.nome ?? `${t("Número")} ${l.channel_session_id.slice(0, 8)}`}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.regra === "24h_ia"
                          ? t("Com IA: conta 24 h")
                          : l.regra === "sem_janela"
                            ? t("Sem janela: conta 24 h")
                            : `${t("Janela")} ${l.hora_ini}h–${l.hora_fim}h`}
                        {l.arquivado ? ` · ${t("arquivado")}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{(l.recebidas + l.enviadas).toLocaleString(idioma)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarDuracao(l.media_s)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Aguardando n={l.aguardando} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TabelaPorAtendente({ painel, gerente }: { painel: RespostaDoPainel; gerente: boolean }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const linhas = painel.por_atendente;

  return (
    <Card data-testid="por-atendente">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Por atendente")}</CardTitle>
        {!gerente ? <p className="text-xs text-muted-foreground">{t("Você vê a sua linha e a da IA.")}</p> : null}
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Sem atividade no período.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Atendente")}</TableHead>
                <TableHead className="text-right">{t("Enviadas")}</TableHead>
                <TableHead className="text-right">{t("Tempo médio")}</TableHead>
                <TableHead className="text-right">{t("Aguardando")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.user_id ?? "ia"}>
                  <TableCell>{l.quem === "ia" ? t("IA") : (l.nome ?? t("Sem nome"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.enviadas.toLocaleString(idioma)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarDuracao(l.media_s)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Aguardando n={l.aguardando} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
