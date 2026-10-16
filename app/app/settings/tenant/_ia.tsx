"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirIaDaEmpresa } from "@/app/actions/settings/definirIaDaEmpresa";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/**
 * O interruptor do ATENDIMENTO COM IA da empresa
 * (`lib/organizacao/ia-da-empresa.ts`). Ligado por padrão.
 */
export function IaDaEmpresa({ ligadoInicial }: { ligadoInicial: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [isPending, startTransition] = useTransition();

  function alternar(v: boolean) {
    startTransition(async () => {
      const r = await definirIaDaEmpresa(v);
      if (!r.ok) {
        toast.error(
          r.error === "forbidden_role"
            ? t("Só o administrador da empresa pode ligar ou desligar a IA.")
            : t("Não foi possível salvar. Tente de novo."),
        );
        return;
      }
      setLigado(v);
      toast.success(v ? t("IA ligada.") : t("IA desligada. Nada foi apagado."));
      // O menu é montado no layout: recarregar a árvore traz ou some as telas de IA.
      router.refresh();
    });
  }

  return (
    <Card className="space-y-2 p-4" data-testid="ia-da-empresa">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("Atendimento com IA")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Ligado, o assistente lê fotos e áudios e responde os clientes. Desligado, nada disso acontece e as telas de IA somem — a equipe atende pelo Inbox normalmente. Nada é apagado: ao religar, agentes e configurações voltam como estavam.",
            )}
          </p>
        </div>
        <Switch
          aria-label={t("Ligar a IA")}
          checked={ligado}
          disabled={isPending}
          onCheckedChange={alternar}
        />
      </div>
    </Card>
  );
}
