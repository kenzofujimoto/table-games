import { Compass, Crown, Feather, Flame, Leaf, Waves } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { playerColors, playerProfileSchema } from "@/multiplayer/types";
import { AppShell } from "@/shared/components/AppShell";
import { Field, TextInput } from "@/shared/components/Field";

import { useAppStore } from "@/app/store";

const colorLabels = { ember: "Brasa", tide: "Maré", moss: "Musgo", amethyst: "Ametista" } as const;
const avatarOptions = [
  { id: "compass", icon: Compass, label: "Bússola" },
  { id: "feather", icon: Feather, label: "Pluma" },
  { id: "crown", icon: Crown, label: "Coroa" },
];
const crestOptions = [
  { id: "sun", icon: Flame, label: "Sol" },
  { id: "wave", icon: Waves, label: "Onda" },
  { id: "leaf", icon: Leaf, label: "Folha" },
];

export function ProfilePage() {
  const existing = useAppStore((state) => state.profile);
  const setProfile = useAppStore((state) => state.setProfile);
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<(typeof playerColors)[number]>(existing?.color ?? "ember");
  const [avatar, setAvatar] = useState(existing?.avatar ?? "compass");
  const [crest, setCrest] = useState(existing?.crest ?? "sun");
  const [error, setError] = useState<string | null>(null);
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const continueAsGuest = () => {
    const parsed = playerProfileSchema.safeParse({
      id: existing?.id ?? crypto.randomUUID(),
      name,
      color,
      avatar,
      crest,
    });
    if (!parsed.success) {
      setError("Use um apelido entre 2 e 24 caracteres.");
      return;
    }
    setProfile(parsed.data);
    void navigate(search.get("next") ?? "/");
  };

  return (
    <AppShell>
      <main className="page-center">
        <section className="form-card form-card--wide">
          <div className="eyebrow">IDENTIDADE DE BORDO</div>
          <h1>Seu explorador</h1>
          <p>Escolha como seus amigos verão você na mesa.</p>
          <Field label="Apelido">
            <TextInput aria-label="Apelido" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como devemos chamar você?" maxLength={24} autoFocus />
          </Field>

          <fieldset className="option-fieldset">
            <legend>Cor</legend>
            <div className="color-options">
              {playerColors.map((value) => (
                <button className={`color-chip color-chip--${value} ${color === value ? "is-selected" : ""}`} type="button" onClick={() => setColor(value)} key={value} aria-pressed={color === value}>
                  <span />{colorLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="profile-options">
            <fieldset className="option-fieldset"><legend>Avatar</legend><div className="icon-options">
              {avatarOptions.map(({ id, icon: Icon, label }) => <button type="button" className={avatar === id ? "is-selected" : ""} onClick={() => setAvatar(id)} aria-label={label} key={id}><Icon /></button>)}
            </div></fieldset>
            <fieldset className="option-fieldset"><legend>Brasão</legend><div className="icon-options">
              {crestOptions.map(({ id, icon: Icon, label }) => <button type="button" className={crest === id ? "is-selected" : ""} onClick={() => setCrest(id)} aria-label={label} key={id}><Icon /></button>)}
            </div></fieldset>
          </div>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button--primary button--full" type="button" onClick={continueAsGuest}>Continuar como convidado</button>
          <small className="muted-note">Seu token de convidado fica salvo neste navegador para permitir reconexão segura.</small>
        </section>
      </main>
    </AppShell>
  );
}
