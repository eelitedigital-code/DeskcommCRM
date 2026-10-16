"use client";

/**
 * LINKS E DADOS DA EMPRESA — os links da marca (Instagram, site, loja no
 * marketplace…) e os campos próprios da empresa (Configurações › Campos da
 * empresa), gravados em `companies.custom_fields`.
 *
 * Mesma tecnologia dos links do contato (`lib/leads/links-de-contato.ts`),
 * VALORES INDEPENDENTES: o Instagram da pessoa e o da marca são coisas
 * diferentes, e nada aqui lê ou grava o contato.
 *
 * O PATCH da empresa SUBSTITUI `custom_fields`; por isso o salvamento parte do
 * objeto relido do servidor e troca só o que este diálogo edita.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { valorDoCampoEmTexto } from "@/components/contacts/DadosDoCliente";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { aplicarMudancas, valorPreenchido } from "@/lib/contacts/campos-do-cliente";
import {
  EXEMPLO_DE_LINK,
  TIPOS_DE_LINK,
  aplicarLinks,
  lerLinks,
  linksParaExibir,
  tiposInvalidos,
  type LinksDoContato,
} from "@/lib/leads/links-de-contato";
import { soChavesAlteradas } from "@/lib/leads/custom-fields-so-diff";
import { camposVisiveis } from "@/lib/schemas/mostrar-quando";
import type { CustomFieldDef } from "@/lib/schemas/settings";

export const CHAVE_DA_QUERY_CAMPOS_DA_EMPRESA = ["campos-da-empresa"] as const;

const ROTULO_DO_LINK = Object.fromEntries(TIPOS_DE_LINK.map((l) => [l.id, l.rotulo]));

export function DadosDaEmpresa({
  companyId,
  customFields,
  podeEditar,
  onSalvo,
}: {
  companyId: string;
  customFields: Record<string, unknown>;
  podeEditar: boolean;
  onSalvo: () => void;
}) {
  const t = useT();
  const definicoes = useQuery({
    queryKey: CHAVE_DA_QUERY_CAMPOS_DA_EMPRESA,
    staleTime: 60_000,
    queryFn: async () =>
      (await apiClient.get<{ data: { fields: CustomFieldDef[] } }>("/api/v1/company-fields")).data
        .fields,
  });
  const campos = definicoes.data ?? [];
  const links = linksParaExibir(customFields);
  const preenchidos = camposVisiveis(campos, customFields).filter((c) =>
    valorPreenchido(customFields[c.key]),
  );
  const [editando, setEditando] = useState(false);
  const rotulos = { sim: t("Sim"), nao: t("Não") };

  return (
    <Card className="space-y-3 p-4" data-testid="dados-da-empresa">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("Links e dados da empresa")}</h2>
        {podeEditar && (
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            {t("Editar")}
          </Button>
        )}
      </div>
      {links.length === 0 && preenchidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum link nem dado da empresa ainda. Use Editar para completar.")}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {links.map((l) => (
            <div key={l.tipo} className="contents">
              <dt className="text-muted-foreground">{ROTULO_DO_LINK[l.tipo]}</dt>
              <dd className="truncate">
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {l.href}
                </a>
              </dd>
            </div>
          ))}
          {preenchidos.map((c) => (
            <div key={c.key} className="contents">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="break-words whitespace-pre-wrap">
                {valorDoCampoEmTexto(c, customFields[c.key], rotulos)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editando && (
        <EditarDadosDaEmpresa
          companyId={companyId}
          campos={campos}
          valoresIniciais={customFields}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            onSalvo();
          }}
        />
      )}
    </Card>
  );
}

function EditarDadosDaEmpresa({
  companyId,
  campos,
  valoresIniciais,
  onFechar,
  onSalvo,
}: {
  companyId: string;
  campos: CustomFieldDef[];
  valoresIniciais: Record<string, unknown>;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const t = useT();
  const [links, setLinks] = useState<LinksDoContato>(() => lerLinks(valoresIniciais));
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(valoresIniciais);
  const [gravando, setGravando] = useState(false);
  const invalidos = tiposInvalidos(links);

  async function salvar() {
    if (invalidos.length > 0) return;
    setGravando(true);
    try {
      // Relê: o PATCH substitui o objeto inteiro, e outra pessoa pode ter
      // mexido enquanto o diálogo estava aberto.
      const atual = await apiClient.get<{
        data: { company: { custom_fields?: Record<string, unknown> } };
      }>(`/api/v1/companies/${companyId}`);
      const base = atual.data.company.custom_fields ?? {};
      const comCampos = aplicarMudancas(base, soChavesAlteradas(valoresIniciais, customFields));
      const proximo = aplicarLinks(comCampos, links);
      await apiClient.patch(`/api/v1/companies/${companyId}`, { custom_fields: proximo });
      toast.success(t("Dados da empresa atualizados."));
      onSalvo();
    } catch (e) {
      showApiError(e);
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Links e dados da empresa")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {TIPOS_DE_LINK.map((l) => (
              <div key={l.id} className="space-y-1">
                <Label htmlFor={`empresa-link-${l.id}`}>{l.rotulo}</Label>
                <Input
                  id={`empresa-link-${l.id}`}
                  placeholder={EXEMPLO_DE_LINK}
                  value={links[l.id] ?? ""}
                  maxLength={1000}
                  aria-invalid={invalidos.includes(l.id) || undefined}
                  onChange={(e) => setLinks((atual) => ({ ...atual, [l.id]: e.target.value }))}
                />
                {invalidos.includes(l.id) && (
                  <p className="text-xs text-error-fg">
                    {t("Cole o endereço completo, começando por https://")}
                  </p>
                )}
              </div>
            ))}
          </div>
          {campos.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">{t("Campos da empresa")}</p>
              <CustomFieldsEditor
                fields={campos}
                value={customFields}
                onChange={setCustomFields}
                mode="contact"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={gravando}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void salvar()} disabled={gravando || invalidos.length > 0}>
            {gravando ? t("Salvando…") : t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
