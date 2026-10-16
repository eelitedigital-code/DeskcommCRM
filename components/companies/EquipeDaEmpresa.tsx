"use client";

/**
 * EQUIPE DA EMPRESA — quem compra por ela, em termos de CONTATOS.
 *
 * A camada `people` não aparece (D7): busca-se um contato, e o servidor
 * resolve a pessoa por baixo (`POST /api/v1/companies/[id]/equipe`).
 *
 * "Marcar como saiu da empresa", nunca "Remover": a linha não é apagada, a
 * venda continua contando para a empresa e o nome deixa de aparecer. Quem lê
 * "Remover" clica achando que apaga, e o comportamento é o oposto.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { phoneForDisplay } from "@/lib/channels/phone-variants";

export interface MembroDaEquipe {
  id: string;
  situacao: "ativo" | "saiu" | "anonimizado";
  nome: string | null;
  cargo: string | null;
  final_do_numero: string | null;
  contact_id: string | null;
  is_decision_maker: boolean;
  is_primary: boolean;
  saiu_em: string | null;
}

interface ContatoDaBusca {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  is_anonymized: boolean;
}

export const chaveDaEquipe = (companyId: string) => ["empresa-equipe", companyId] as const;

/** "Gerente de compras · ****-4821" — a forma de quem saiu, e o fim da forma de quem está. */
export function cargoEFinal(cargo: string | null, final: string | null): string {
  return [cargo, final ? `****-${final}` : null].filter(Boolean).join(" · ");
}

export function EquipeDaEmpresa({
  companyId,
  podeEditar,
  onMudou,
}: {
  companyId: string;
  podeEditar: boolean;
  /** A equipe mexe no painel de vendas: quem chama recarrega. */
  onMudou?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const equipe = useQuery({
    queryKey: chaveDaEquipe(companyId),
    queryFn: async () =>
      (await apiClient.get<{ data: MembroDaEquipe[] }>(`/api/v1/companies/${companyId}/equipe`))
        .data,
  });
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [saindo, setSaindo] = useState<MembroDaEquipe | null>(null);
  const [gravando, setGravando] = useState(false);

  async function recarregar() {
    await qc.invalidateQueries({ queryKey: chaveDaEquipe(companyId) });
    onMudou?.();
  }

  async function marcarSaida(m: MembroDaEquipe, saiu: boolean) {
    setGravando(true);
    try {
      await apiClient.patch(`/api/v1/companies/${companyId}/equipe/${m.id}`, { saiu });
      toast.success(saiu ? t("Marcado como saiu da empresa.") : t("Voltou para a equipe."));
      setSaindo(null);
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setGravando(false);
    }
  }

  const membros = equipe.data ?? [];
  const ativos = membros.filter((m) => m.situacao === "ativo");
  const foraDaEquipe = membros.filter((m) => m.situacao !== "ativo");

  return (
    <Card className="space-y-3 p-4" data-testid="equipe-da-empresa">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("Equipe")}</h2>
        {podeEditar && (
          <Button size="sm" variant="outline" onClick={() => setAdicionarAberto(true)}>
            {t("Adicionar à equipe")}
          </Button>
        )}
      </div>

      {equipe.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : equipe.isError ? (
        <p className="text-sm text-error-fg">{t("Não foi possível carregar a equipe.")}</p>
      ) : membros.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Ninguém na equipe ainda. Adicione os contatos que compram por esta empresa.")}
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {ativos.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                {m.contact_id ? (
                  <Link
                    href={`/app/contacts/${m.contact_id}`}
                    className="font-medium hover:underline"
                  >
                    {m.nome ?? t("Contato")}
                  </Link>
                ) : (
                  <span className="font-medium">{m.nome ?? t("Contato")}</span>
                )}
                <p className="text-xs text-muted-foreground">
                  {cargoEFinal(m.cargo, m.final_do_numero) || t("Sem cargo")}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.is_decision_maker && <Badge variant="info">{t("Decide a compra")}</Badge>}
                  {m.is_primary && <Badge variant="neutral">{t("Contato principal")}</Badge>}
                </div>
              </div>
              {podeEditar && (
                <Button size="sm" variant="ghost" onClick={() => setSaindo(m)}>
                  {t("Marcar como saiu da empresa")}
                </Button>
              )}
            </li>
          ))}
          {foraDaEquipe.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-2 py-2 text-muted-foreground"
            >
              <div className="min-w-0">
                <span>
                  {m.situacao === "anonimizado"
                    ? t("Pessoa anonimizada (LGPD)")
                    : cargoEFinal(m.cargo, m.final_do_numero) || t("Ex-integrante")}
                </span>
                <p className="text-xs">
                  {m.situacao === "anonimizado"
                    ? t("Dados apagados a pedido do titular.")
                    : t("Saiu da empresa.")}
                </p>
              </div>
              {podeEditar && m.situacao === "saiu" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={gravando}
                  onClick={() => void marcarSaida(m, false)}
                >
                  {t("Voltou para a equipe")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AdicionarAEquipe
        companyId={companyId}
        aberto={adicionarAberto}
        onFechar={() => setAdicionarAberto(false)}
        onAdicionado={recarregar}
      />

      <Dialog open={saindo !== null} onOpenChange={(v) => !v && setSaindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Marcar como saiu da empresa?")}</DialogTitle>
            <DialogDescription>
              {t(
                "Nada é apagado. As vendas desta pessoa continuam contando para a empresa, mas o nome deixa de aparecer: fica só o cargo e o final do número.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaindo(null)} disabled={gravando}>
              {t("Cancelar")}
            </Button>
            <Button onClick={() => saindo && void marcarSaida(saindo, true)} disabled={gravando}>
              {gravando ? t("Salvando…") : t("Marcar como saiu")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AdicionarAEquipe({
  companyId,
  aberto,
  onFechar,
  onAdicionado,
}: {
  companyId: string;
  aberto: boolean;
  onFechar: () => void;
  onAdicionado: () => Promise<void>;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<ContatoDaBusca | null>(null);
  const [cargo, setCargo] = useState("");
  const [decide, setDecide] = useState(false);
  const [principal, setPrincipal] = useState(false);
  const [gravando, setGravando] = useState(false);

  const termo = busca.trim();
  const resultados = useQuery({
    queryKey: ["empresa-equipe-busca", termo],
    enabled: aberto && termo.length >= 2 && !escolhido,
    queryFn: async () => {
      const params = new URLSearchParams({ search: termo, limit: "8" });
      const res = await apiClient.get<{ data: ContatoDaBusca[] }>(
        `/api/v1/contacts?${params.toString()}`,
      );
      // Contato anonimizado não entra na equipe: nem aparece na busca.
      return res.data.filter((c) => !c.is_anonymized);
    },
  });

  function fechar() {
    setBusca("");
    setEscolhido(null);
    setCargo("");
    setDecide(false);
    setPrincipal(false);
    onFechar();
  }

  async function adicionar() {
    if (!escolhido) return;
    setGravando(true);
    try {
      await apiClient.post(`/api/v1/companies/${companyId}/equipe`, {
        contact_id: escolhido.id,
        job_title: cargo.trim() || null,
        is_decision_maker: decide,
        is_primary: principal,
      });
      toast.success(t("Adicionado à equipe."));
      await onAdicionado();
      fechar();
    } catch (e) {
      showApiError(e);
    } finally {
      setGravando(false);
    }
  }

  const rotulo = (c: ContatoDaBusca) =>
    c.name || c.display_name || (c.phone_number ? phoneForDisplay(c.phone_number) : t("Contato"));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Adicionar à equipe")}</DialogTitle>
          <DialogDescription>
            {t("Escolha um contato que compra por esta empresa.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {escolhido ? (
            <div className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
              <span className="font-medium">{rotulo(escolhido)}</span>
              <Button size="sm" variant="ghost" onClick={() => setEscolhido(null)}>
                {t("Trocar")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="equipe-busca">{t("Contato")}</Label>
              <Input
                id="equipe-busca"
                placeholder={t("Nome ou telefone")}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
              />
              {termo.length >= 2 && (
                <ul
                  className="max-h-48 overflow-y-auto rounded-md border border-border text-sm"
                  data-testid="equipe-resultados"
                >
                  {resultados.isLoading ? (
                    <li className="p-2 text-muted-foreground">{t("Buscando…")}</li>
                  ) : (resultados.data ?? []).length === 0 ? (
                    <li className="p-2 text-muted-foreground">{t("Nenhum contato encontrado.")}</li>
                  ) : (
                    (resultados.data ?? []).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full p-2 text-left hover:bg-surface-elevated"
                          onClick={() => setEscolhido(c)}
                        >
                          <span className="font-medium">{rotulo(c)}</span>
                          {c.phone_number && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {phoneForDisplay(c.phone_number)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="equipe-cargo">{t("Cargo")}</Label>
            <Input
              id="equipe-cargo"
              placeholder={t("Ex.: Sócio, Gerente de compras")}
              value={cargo}
              maxLength={200}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={decide} onChange={(e) => setDecide(e.target.checked)} />
            {t("Decide a compra")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={principal}
              onChange={(e) => setPrincipal(e.target.checked)}
            />
            {t("Contato principal da empresa")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={gravando}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void adicionar()} disabled={!escolhido || gravando}>
            {gravando ? t("Salvando…") : t("Adicionar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
