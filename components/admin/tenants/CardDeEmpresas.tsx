"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirEmpresasDoTenant } from "@/app/actions/admin/definirEmpresasDoTenant";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/**
 * Capacidade `empresas` desta organização, vista pelo admin da plataforma. A
 * própria empresa tem o mesmo interruptor em Configurações › Organização.
 */
export function CardDeEmpresas({
  orgId,
  ligadoInicial,
}: {
  orgId: string;
  ligadoInicial: boolean;
}) {
  const t = useT();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [isPending, startTransition] = useTransition();

  function alternar(v: boolean) {
    startTransition(async () => {
      const r = await definirEmpresasDoTenant(orgId, v);
      if (!r.ok) {
        toast.error(t("Não foi possível salvar. Tente de novo."));
        return;
      }
      setLigado(v);
      toast.success(v ? t("Empresas ligado.") : t("Empresas desligado. Nada foi apagado."));
    });
  }

  return (
    <Card className="flex items-start justify-between gap-4 p-4" data-testid="card-de-empresas">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("Empresas (vendas para empresas)")}</p>
        <p className="text-xs text-muted-foreground">
          {t("Cadastro de empresas, equipe e painel de vendas da empresa para esta organização.")}
        </p>
      </div>
      <Switch
        aria-label={t("Ligar Empresas")}
        checked={ligado}
        disabled={isPending}
        onCheckedChange={alternar}
      />
    </Card>
  );
}
