"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirIaDoTenant } from "@/app/actions/admin/definirIaDoTenant";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/** A IA desta organização, vista pelo admin da plataforma. */
export function CardDeIa({ orgId, ligadoInicial }: { orgId: string; ligadoInicial: boolean }) {
  const t = useT();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [isPending, startTransition] = useTransition();

  function alternar(v: boolean) {
    startTransition(async () => {
      const r = await definirIaDoTenant(orgId, v);
      if (!r.ok) {
        toast.error(t("Não foi possível salvar. Tente de novo."));
        return;
      }
      setLigado(v);
      toast.success(v ? t("IA ligada.") : t("IA desligada. Nada foi apagado."));
    });
  }

  return (
    <Card className="flex items-start justify-between gap-4 p-4" data-testid="card-de-ia">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("Atendimento com IA")}</p>
        <p className="text-xs text-muted-foreground">
          {t("Desligado, esta organização não lê fotos e áudios nem responde com IA. Nada é apagado.")}
        </p>
      </div>
      <Switch aria-label={t("Ligar a IA")} checked={ligado} disabled={isPending} onCheckedChange={alternar} />
    </Card>
  );
}
