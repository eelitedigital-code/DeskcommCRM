"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarCamposDoCliente } from "@/app/actions/settings/salvarCamposDoCliente";
import { EditorDeCampos, prepararCamposParaGravar } from "@/components/settings/EditorDeCampos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE } from "@/hooks/contacts/useCamposDoCliente";
import { useT } from "@/hooks/i18n/useT";
import {
  CAMPOS_PRONTOS,
  comCampoPronto,
  gruposDosCamposProntos,
  type CampoPronto,
} from "@/lib/contacts/campos-prontos";
import type { CustomFieldDef } from "@/lib/schemas/settings";

interface Props {
  campos: CustomFieldDef[];
  /** Chaves já usadas nos funis — só para o aviso de colisão. */
  camposDosFunis: Array<{ chave: string; funil: string }>;
}

export function CamposDoClienteClient({ campos, camposDosFunis }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [fields, setFields] = useState<CustomFieldDef[]>(campos);
  // A última lista GRAVADA. O interruptor de campo pronto grava a partir dela,
  // e não do rascunho do editor: uma edição pela metade lá embaixo não pode ir
  // junto (nem barrar o interruptor por estar inválida).
  const [salvos, setSalvos] = useState<CustomFieldDef[]>(campos);
  const [isPending, startTransition] = useTransition();
  const [alternando, setAlternando] = useState<string | null>(null);

  const ligados = new Set(salvos.map((c) => c.key));

  function mensagemDeErro(erro: string) {
    return erro === "chave_repetida"
      ? t("Duas linhas usam a mesma chave. Cada campo precisa de uma chave diferente.")
      : erro === "forbidden_role"
        ? t("Só gerente ou administrador pode mudar os campos do cliente.")
        : t("Não foi possível salvar. Tente de novo.");
  }

  function alternar(pronto: CampoPronto, ligar: boolean) {
    const chave = pronto.campo.key;
    setAlternando(chave);
    startTransition(async () => {
      const r = await salvarCamposDoCliente(comCampoPronto(salvos, pronto, ligar));
      setAlternando(null);
      if (!r.ok) {
        toast.error(mensagemDeErro(r.error));
        return;
      }
      setSalvos((atual) => comCampoPronto(atual, pronto, ligar));
      setFields((atual) => comCampoPronto(atual, pronto, ligar));
      toast.success(
        ligar
          ? `${pronto.campo.label}: ${t("ativado.")}`
          : `${pronto.campo.label}: ${t("desativado. O que já foi preenchido continua guardado.")}`,
      );
      void qc.invalidateQueries({ queryKey: CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE });
    });
  }

  const chavesNaTela = new Set(fields.map((f) => f.key.trim()));
  const colisoes = camposDosFunis.filter((c) => chavesNaTela.has(c.chave));

  function salvar() {
    const preparados = prepararCamposParaGravar(fields);
    if (!preparados.ok) {
      toast.error(preparados.mensagem ?? t("Campo inválido."));
      return;
    }
    startTransition(async () => {
      const r = await salvarCamposDoCliente(preparados.campos);
      if (r.ok) {
        setSalvos(preparados.campos);
        toast.success(t("Campos do cliente salvos."));
        // A ficha, o painel da conversa e o dossiê leem pela mesma query.
        void qc.invalidateQueries({ queryKey: CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE });
        return;
      }
      toast.error(mensagemDeErro(r.error));
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4" data-testid="campos-prontos">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("Campos prontos")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Ative só o que a sua empresa usa. Desativar esconde o campo, mas não apaga o que já foi preenchido: ao ativar de novo, os valores voltam.",
            )}
          </p>
        </div>
        {gruposDosCamposProntos().map((grupo) => (
          <section key={grupo} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">{grupo}</h3>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {CAMPOS_PRONTOS.filter((p) => p.grupo === grupo).map((p) => {
                const ligado = ligados.has(p.campo.key);
                return (
                  <li
                    key={p.campo.key}
                    className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.campo.label}</p>
                      <p className="text-xs text-muted-foreground">{t(p.descricao)}</p>
                    </div>
                    <Switch
                      aria-label={`${t("Ativar")} ${p.campo.label}`}
                      checked={ligado}
                      disabled={isPending && alternando !== null}
                      onCheckedChange={(v) => alternar(p, v)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("Campos próprios e ajustes")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "A chave é o nome interno do campo e não deve mudar depois de usada: o valor de cada cliente fica guardado nela. Remover um campo daqui não apaga o que já foi preenchido.",
            )}
          </p>
        </div>

        <div className="space-y-2">
          <EditorDeCampos fields={fields} onChange={setFields} />
        </div>

        {colisoes.length > 0 && (
          <div className="rounded-md border border-warning bg-warning-bg p-3 text-xs text-warning-fg">
            <p className="font-medium">{t("Chave que também existe num funil")}</p>
            <ul className="mt-1 list-disc pl-4">
              {colisoes.map((c) => (
                <li key={`${c.funil}-${c.chave}`}>
                  <code>{c.chave}</code> — {c.funil}
                </li>
              ))}
            </ul>
            <p className="mt-1">
              {t(
                "Nesses casos vale o valor do cadastro do cliente, e o campo deixa de aparecer no negócio. O que já estava gravado no negócio continua guardado.",
              )}
            </p>
          </div>
        )}

        <div className="flex sm:justify-end">
          <Button onClick={salvar} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? t("Salvando…") : t("Salvar campos do cliente")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
