"use client";

/**
 * "Ajustar régua" — gerente+ (D5/D6/D11). Grava em
 * `PATCH /api/v1/painel/atendimento/configuracao`, que valida de novo e
 * recusa régua torta; aqui a mesma conta só serve para avisar antes.
 *
 * O HORÁRIO não se ajusta aqui: é a janela de resposta de cada número, em
 * Conexões. Aqui só se liga ou desliga "número com IA no ar conta 24 h".
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { useConfiguracaoDoPainel, useSalvarConfiguracaoDoPainel } from "@/hooks/painel/usePainelAtendimento";

export function AjustarRegua() {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const { data } = useConfiguracaoDoPainel();
  const salvar = useSalvarConfiguracaoDoPainel();
  const atual = data?.data.configuracao;

  const [conta24h, setConta24h] = useState(true);
  const [esperado, setEsperado] = useState("5");
  const [atencao, setAtencao] = useState("15");
  const [limite, setLimite] = useState("15");

  // Abrir o diálogo carrega a régua em vigor no formulário (no gesto, e não
  // num efeito: o formulário é do usuário enquanto ele está aberto).
  function abrir(proximo: boolean) {
    if (proximo && atual) {
      setConta24h(atual.conta_24h_com_ia);
      setEsperado(String(atual.limiares.resposta_esperado_min));
      setAtencao(String(atual.limiares.resposta_atencao_min));
      setLimite(String(atual.limiares.espera_limite_min));
    }
    setAberto(proximo);
  }

  const e = Number(esperado);
  const a = Number(atencao);
  const l = Number(limite);
  const valido = [e, a, l].every((v) => Number.isInteger(v) && v >= 1 && v <= 1440) && a > e;

  async function enviar() {
    try {
      await salvar.mutateAsync({
        conta_24h_com_ia: conta24h,
        limiares: { resposta_esperado_min: e, resposta_atencao_min: a, espera_limite_min: l },
      });
      toast.success(t("Régua do painel salva."));
      setAberto(false);
    } catch {
      toast.error(t("Não foi possível salvar. Tente de novo."));
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{t("Ajustar régua")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Régua do painel")}</DialogTitle>
          <DialogDescription>
            {t("Vale para todos os períodos daqui em diante. O horário de cada número é a janela de resposta dele, em Conexões.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="regua-24h">{t("Número com IA no ar conta 24 horas")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("Desligado, todo número conta só a própria janela de resposta.")}
              </span>
            </div>
            <Switch id="regua-24h" checked={conta24h} onCheckedChange={setConta24h} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="regua-esperado">{t("Esperado até (min)")}</Label>
              <Input id="regua-esperado" type="number" min={1} max={1440} value={esperado} onChange={(ev) => setEsperado(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="regua-atencao">{t("Atenção até (min)")}</Label>
              <Input id="regua-atencao" type="number" min={1} max={1440} value={atencao} onChange={(ev) => setAtencao(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="regua-limite">{t("Limite de espera (min)")}</Label>
              <Input id="regua-limite" type="number" min={1} max={1440} value={limite} onChange={(ev) => setLimite(ev.target.value)} />
            </div>
          </div>
          {!valido ? (
            <p className="text-xs text-destructive">{t("Use minutos inteiros de 1 a 1440, com a atenção maior que o esperado.")}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)}>{t("Cancelar")}</Button>
          <Button onClick={enviar} disabled={!valido || salvar.isPending}>
            {salvar.isPending ? t("Salvando…") : t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
