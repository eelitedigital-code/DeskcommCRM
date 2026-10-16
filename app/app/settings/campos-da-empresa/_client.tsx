"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { salvarCamposDaEmpresa } from "@/app/actions/settings/salvarCamposDaEmpresa";
import { EditorDeCampos, prepararCamposParaGravar } from "@/components/settings/EditorDeCampos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CHAVE_DA_QUERY_CAMPOS_DA_EMPRESA } from "@/components/companies/DadosDaEmpresa";
import { useT } from "@/hooks/i18n/useT";
import type { CustomFieldDef } from "@/lib/schemas/settings";

export function CamposDaEmpresaClient({ campos }: { campos: CustomFieldDef[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [fields, setFields] = useState<CustomFieldDef[]>(campos);
  const [isPending, startTransition] = useTransition();

  function salvar() {
    const preparados = prepararCamposParaGravar(fields);
    if (!preparados.ok) {
      toast.error(preparados.mensagem ?? t("Campo inválido."));
      return;
    }
    startTransition(async () => {
      const r = await salvarCamposDaEmpresa(preparados.campos);
      if (r.ok) {
        toast.success(t("Campos da empresa salvos."));
        void qc.invalidateQueries({ queryKey: CHAVE_DA_QUERY_CAMPOS_DA_EMPRESA });
        return;
      }
      toast.error(
        r.error === "chave_repetida"
          ? t("Duas linhas usam a mesma chave. Cada campo precisa de uma chave diferente.")
          : r.error === "forbidden_role"
            ? t("Só gerente ou administrador pode mudar os campos da empresa.")
            : t("Não foi possível salvar. Tente de novo."),
      );
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-xs text-muted-foreground">
        {t(
          "A chave é o nome interno do campo e não deve mudar depois de usada: o valor de cada empresa fica guardado nela. Remover um campo daqui não apaga o que já foi preenchido.",
        )}
      </p>
      <div className="space-y-2">
        <EditorDeCampos fields={fields} onChange={setFields} />
      </div>
      <div className="flex sm:justify-end">
        <Button onClick={salvar} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? t("Salvando…") : t("Salvar campos da empresa")}
        </Button>
      </div>
    </Card>
  );
}
