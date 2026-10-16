"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirEmpresasDaOrganizacao } from "@/app/actions/settings/definirEmpresasDaOrganizacao";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/**
 * O interruptor da capacidade `empresas` para a própria organização. Só
 * aparece com o módulo `crm_b2b` ligado na instalação: sem ele, a empresa não
 * liga o que o servidor não oferece (quem decide é `/admin/sistema`).
 */
export function EmpresasDaOrganizacao({ ligadoInicial }: { ligadoInicial: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [isPending, startTransition] = useTransition();

  function alternar(v: boolean) {
    startTransition(async () => {
      const r = await definirEmpresasDaOrganizacao(v);
      if (!r.ok) {
        toast.error(
          r.error === "forbidden_role"
            ? t("Só o administrador da empresa pode ligar ou desligar Empresas.")
            : t("Não foi possível salvar. Tente de novo."),
        );
        return;
      }
      setLigado(v);
      toast.success(v ? t("Empresas ligado.") : t("Empresas desligado. Nada foi apagado."));
      // O menu é montado no layout: recarregar a árvore traz ou some a porta.
      router.refresh();
    });
  }

  return (
    <Card className="space-y-2 p-4" data-testid="empresas-da-organizacao">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("Empresas (vendas para empresas)")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Cadastro de empresas com CNPJ, a equipe de cada empresa e o painel com quanto ela já comprou. Desligar esconde tudo isso; nada é apagado.",
            )}
          </p>
        </div>
        <Switch
          aria-label={t("Ligar Empresas")}
          checked={ligado}
          disabled={isPending}
          onCheckedChange={alternar}
        />
      </div>
    </Card>
  );
}
