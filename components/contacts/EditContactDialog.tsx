"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { perfilDoPais } from "@/lib/legal/perfil-do-pais";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarTags } from "@/lib/contacts/tag-normalizada";
import { contactPatchSchemaDoPais, type ContactPatch } from "@/lib/schemas/contacts";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import type { Contact } from "@/lib/types/contacts";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { valorPreenchido } from "@/lib/contacts/campos-do-cliente";
import { valorDoCampoEmTexto } from "@/components/contacts/DadosDoCliente";

/** Uma linha do "valor antigo → valor novo" da confirmação. */
interface Sobrescrita {
  rotulo: string;
  de: string;
  para: string;
}

function mesmoValor(a: unknown, b: unknown): boolean {
  if (!valorPreenchido(a) && !valorPreenchido(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

interface FormShape {
  name?: string;
  email?: string;
  phone_number?: string;
  /** `AAAA-MM-DD` — a MESMA forma de `contactPatchSchema` e da coluna do banco. */
  birthdate?: string;
  tagsRaw?: string;
  custom_fields?: Record<string, unknown>;
}

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Os campos do cliente da organização (`organizations.settings.contact_fields`).
   * Vazio = a seção some.
   */
  customFieldDefs?: CustomFieldDef[];
}

export function EditContactDialog({ contact, open, onOpenChange, customFieldDefs = [] }: Props) {
  const t = useT();
  const perfil = perfilDoPais(useActiveOrg()?.country);
  const update = useUpdateContact(contact.id);
  const [serverError, setServerError] = useState<string | null>(null);
  // O salvamento que espera a confirmação: o payload já validado e a lista do
  // que ele sobrescreve. Um diálogo por salvamento, nunca um por campo.
  const [aConfirmar, setAConfirmar] = useState<{
    dados: ContactPatch;
    sobrescritas: Sobrescrita[];
  } | null>(null);

  const form = useForm<FormShape>({
    defaultValues: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone_number: contact.phone_number ? phoneForDisplay(contact.phone_number) : "",
      birthdate: contact.birthdate ?? "",
      tagsRaw: contact.tags.join(", "),
      custom_fields: contact.custom_fields ?? {},
    },
  });

  const customFields = useWatch({ control: form.control, name: "custom_fields" });

  useEffect(() => {
    if (open) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone_number: contact.phone_number ? phoneForDisplay(contact.phone_number) : "",
        birthdate: contact.birthdate ?? "",
        tagsRaw: contact.tags.join(", "),
        custom_fields: contact.custom_fields ?? {},
      });
    }
  }, [open, contact, form]);

  async function onSubmit(values: FormShape) {
    setServerError(null);
    // A MESMA normalização da API (lib/contacts/tag-normalizada): o que a ficha
    // grava é o que o filtro `?tag=` casa (issue #1224).
    const tags = normalizarTags((values.tagsRaw ?? "").split(","));

    const payload: Record<string, unknown> = {};
    if (values.name?.trim()) payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = values.phone_number.trim();
    // Igual aos campos de cima: só manda quando há data. O `type="date"` devolve
    // `AAAA-MM-DD` (a forma que `contactPatchSchema` e a coluna `birthdate` já
    // exigem), então o diálogo não normaliza nada — o que se digita é o que se
    // grava, e a ficha recarregada mostra a MESMA string.
    if (values.birthdate?.trim()) payload.birthdate = values.birthdate.trim();
    payload.tags = tags;
    // Sempre no payload, mesmo vazio: o PATCH SUBSTITUI, e é assim que apagar um
    // campo pela tela chega ao banco.
    payload.custom_fields = values.custom_fields ?? {};

    // A MESMA régua do servidor (a rota usa `contactPatchSchemaDoPais`): a
    // tela não pode recusar, com exemplo brasileiro, o que lá passaria.
    const parsed = contactPatchSchemaDoPais(perfil).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t("Dados inválidos"));
      return;
    }
    const sobrescritas = oQueSobrescreve(values, tags);
    if (sobrescritas.length > 0) {
      setAConfirmar({ dados: parsed.data as ContactPatch, sobrescritas });
      return;
    }
    await gravar(parsed.data as ContactPatch);
  }

  /**
   * CONFIRMAR SÓ QUANDO SOBRESCREVE (D5). Preencher o que estava vazio salva
   * direto: a edição já é auditada com de→para, e pedir confirmação em tudo
   * ensina a equipe a parar de corrigir cadastro. Mudar ou limpar o que JÁ
   * tinha valor lista item a item o que vai mudar.
   *
   * Nome, e-mail, telefone e nascimento só entram quando o novo valor foi
   * digitado: deixar o campo em branco não apaga nada (o payload os omite).
   */
  function oQueSobrescreve(values: FormShape, tags: string[]): Sobrescrita[] {
    const lista: Sobrescrita[] = [];
    const vazio = t("(vazio)");
    const basico: Array<[string, string, string | undefined]> = [
      [t("Nome"), contact.name ?? "", values.name],
      ["Email", contact.email ?? "", values.email],
      [
        t("Telefone"),
        contact.phone_number ? phoneForDisplay(contact.phone_number) : "",
        values.phone_number,
      ],
      [
        t("Data de nascimento"),
        contact.birthdate ? contact.birthdate.split("-").reverse().join("/") : "",
        values.birthdate?.trim() ? values.birthdate.trim().split("-").reverse().join("/") : "",
      ],
    ];
    for (const [rotulo, antes, depois] of basico) {
      const novo = (depois ?? "").trim();
      if (antes && novo && novo !== antes) lista.push({ rotulo, de: antes, para: novo });
    }
    if (contact.tags.length > 0 && contact.tags.join(", ") !== tags.join(", ")) {
      lista.push({ rotulo: "Tags", de: contact.tags.join(", "), para: tags.join(", ") || vazio });
    }
    const antes = contact.custom_fields ?? {};
    const depois = values.custom_fields ?? {};
    const rotulos = { sim: t("Sim"), nao: t("Não") };
    for (const campo of customFieldDefs) {
      const de = antes[campo.key];
      const para = depois[campo.key];
      if (!valorPreenchido(de) || mesmoValor(de, para)) continue;
      lista.push({
        rotulo: campo.label,
        de: valorDoCampoEmTexto(campo, de, rotulos),
        para: valorDoCampoEmTexto(campo, para, rotulos) || vazio,
      });
    }
    return lista;
  }

  async function gravar(dados: ContactPatch) {
    try {
      await update.mutateAsync(dados);
      toast.success(t("Contato atualizado"));
      setAConfirmar(null);
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Editar contato")}</DialogTitle>
          <DialogDescription>{t("Atualize os dados deste contato.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ec-name">{t("Nome")}</Label>
            <Input id="ec-name" {...form.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-email">Email</Label>
            <Input id="ec-email" type="email" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-phone">{t("Telefone (E.164)")}</Label>
            <Input id="ec-phone" {...form.register("phone_number")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-birthdate">{t("Data de nascimento")}</Label>
            <Input id="ec-birthdate" type="date" {...form.register("birthdate")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-tags">{t("Tags")}</Label>
            <Input id="ec-tags" {...form.register("tagsRaw")} />
          </div>
          {customFieldDefs.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <h3 className="text-sm font-medium">{t("Dados do cliente")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("Definidos em Configurações › Campos do cliente.")}
                </p>
              </div>
              <CustomFieldsEditor
                fields={customFieldDefs}
                mode="contact"
                value={customFields ?? {}}
                onChange={(next) => form.setValue("custom_fields", next, { shouldDirty: true })}
              />
            </div>
          )}
          {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <AlertDialog
        open={aConfirmar !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAConfirmar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Substituir dados já preenchidos?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Estes campos já tinham valor e vão mudar:")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm" data-testid="confirmar-sobrescrita">
            {aConfirmar?.sobrescritas.map((item) => (
              <li key={item.rotulo}>
                <span className="font-medium">{item.rotulo}:</span>{" "}
                <span className="text-muted-foreground line-through">{item.de}</span> →{" "}
                <span>{item.para}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={(e) => {
                // O diálogo só fecha quando a gravação termina.
                e.preventDefault();
                if (aConfirmar) void gravar(aConfirmar.dados);
              }}
            >
              {update.isPending ? t("Salvando…") : t("Confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
