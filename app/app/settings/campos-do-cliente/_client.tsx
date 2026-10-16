"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarCamposDoCliente } from "@/app/actions/settings/salvarCamposDoCliente";
import { EditorDeCampos, prepararCamposParaGravar } from "@/components/settings/EditorDeCampos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE } from "@/hooks/contacts/useCamposDoCliente";
import { useT } from "@/hooks/i18n/useT";
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
  const [isPending, startTransition] = useTransition();

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
        toast.success(t("Campos do cliente salvos."));
        // A ficha, o painel da conversa e o dossiê leem pela mesma query.
        void qc.invalidateQueries({ queryKey: CHAVE_DA_QUERY_CAMPOS_DO_CLIENTE });
        return;
      }
      toast.error(
        r.error === "chave_repetida"
          ? t("Duas linhas usam a mesma chave. Cada campo precisa de uma chave diferente.")
          : r.error === "forbidden_role"
            ? t("Só gerente ou administrador pode mudar os campos do cliente.")
            : t("Não foi possível salvar. Tente de novo."),
      );
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("Dados que você guarda de cada cliente")}</p>
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
  );
}
