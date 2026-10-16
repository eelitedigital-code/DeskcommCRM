"use client";

/**
 * DADOS DO CLIENTE, EDITÁVEIS FORA DA FICHA — o bloco do painel da conversa e
 * do dossiê do negócio.
 *
 * Grava SEMPRE no contato (`PATCH /api/v1/contacts/[id]`), nunca no negócio:
 * é o que faz o cadastro do cliente prevalecer sobre o funil (D2) — um lugar só
 * de gravação. Funciona sem negócio aberto, ao contrário do bloco de campos do
 * funil, que depende do `leadId`.
 *
 * ⚠️ O PATCH do contato SUBSTITUI `custom_fields`. Este bloco só renderiza os
 * campos do cliente; mandar o que ele tem na tela apagaria qualquer outra chave
 * gravada no contato. Por isso o salvamento relê o contato e aplica por cima
 * SÓ as chaves que a pessoa mudou aqui (`soChavesAlteradas` + `aplicarMudancas`).
 */
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact } from "@/hooks/contacts/useContact";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { useT } from "@/hooks/i18n/useT";
import { aplicarMudancas } from "@/lib/contacts/campos-do-cliente";
import { soChavesAlteradas } from "@/lib/leads/custom-fields-so-diff";
import type { CustomFieldDef } from "@/lib/schemas/settings";
import { cn } from "@/lib/utils";

interface Props {
  contactId: string;
  campos: CustomFieldDef[];
  /** Painel estreito (inbox): uma coluna e botão compacto. */
  compacto?: boolean;
  disabled?: boolean;
  /** Mostra o link para configurar quando não há campo nenhum (manager+). */
  podeConfigurar?: boolean;
}

export function CamposDoClienteEditaveis({
  contactId,
  campos,
  compacto = false,
  disabled = false,
  podeConfigurar = false,
}: Props) {
  const t = useT();
  const contato = useContact(contactId);

  if (campos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("Nenhum campo do cliente configurado.")}{" "}
        {podeConfigurar && (
          <Link href="/app/settings/campos-do-cliente" className="underline">
            {t("Configurar")}
          </Link>
        )}
      </p>
    );
  }
  if (contato.isLoading) return <Skeleton className="h-16 w-full" />;
  if (contato.isError || !contato.data) {
    return <p className="text-xs text-error-fg">{t("Não foi possível carregar o contato.")}</p>;
  }

  return (
    <Formulario
      key={contactId}
      contactId={contactId}
      campos={campos}
      valoresIniciais={contato.data.data.custom_fields ?? {}}
      releContato={async () => (await contato.refetch()).data?.data.custom_fields}
      compacto={compacto}
      disabled={disabled}
    />
  );
}

/**
 * O formulário nasce do valor carregado (`key` por contato): trocar de contato
 * remonta, e o estado não precisa ser ressincronizado por efeito.
 */
function Formulario({
  contactId,
  campos,
  valoresIniciais,
  releContato,
  compacto,
  disabled,
}: {
  contactId: string;
  campos: CustomFieldDef[];
  valoresIniciais: Record<string, unknown>;
  releContato: () => Promise<Record<string, unknown> | undefined>;
  compacto: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const update = useUpdateContact(contactId);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(valoresIniciais);
  // A RÉGUA do diff: o valor carregado. Só o que mudar daqui viaja.
  const [camposCarregados, setCamposCarregados] =
    useState<Record<string, unknown>>(valoresIniciais);

  async function salvar() {
    const mudancas = soChavesAlteradas(camposCarregados, customFields);
    if (Object.keys(mudancas).length === 0) {
      toast.info(t("Nada mudou."));
      return;
    }
    // Relê o contato: alguém pode ter gravado outra chave enquanto o bloco
    // estava aberto, e o PATCH substitui o objeto inteiro.
    const base = (await releContato()) ?? camposCarregados;
    const proximo = aplicarMudancas(base, mudancas);
    try {
      await update.mutateAsync({ custom_fields: proximo });
      setCamposCarregados(proximo);
      setCustomFields(proximo);
      toast.success(t("Dados do cliente atualizados"));
    } catch {
      // o hook já mostrou o erro
    }
  }

  return (
    <div className="space-y-3" data-testid="campos-do-cliente-editaveis">
      <CustomFieldsEditor
        fields={campos}
        value={customFields}
        onChange={setCustomFields}
        mode="contact"
        disabled={disabled || update.isPending}
        className={cn(compacto && "gap-3 md:grid-cols-1")}
      />
      <Button
        size="sm"
        className={cn(compacto && "h-7 w-full text-xs")}
        disabled={disabled || update.isPending}
        onClick={() => void salvar()}
      >
        {update.isPending ? t("Salvando…") : t("Salvar dados do cliente")}
      </Button>
    </div>
  );
}
