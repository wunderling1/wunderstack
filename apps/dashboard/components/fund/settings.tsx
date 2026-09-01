import { Card, Chip } from "@wunderstack/ui";
import {
  AddUserForm,
  ChangeEmailForm,
  DeactivateForm,
  DumpForm,
  ResetPasswordForm,
  UpdateNameForm,
} from "@/app/(admin)/admin/funds/[fundKey]/manage-forms";
import { BrandingForm, BrandingPreview } from "@/components/fund/branding-form";
import type { SettingsModel } from "@/lib/settings-load";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

/** One Instellingen surface for admin and fund face (S5). Write controls follow `canWrite`. */
export function SettingsView({
  model,
  canWrite,
}: {
  model: SettingsModel;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="font-display text-lg font-semibold text-text">Instellingen</h2>
        <p className="mt-1 text-sm text-text-muted">
          {canWrite
            ? "Huisstijl, accounts en fondsbeheer voor dit fonds."
            : "Dit fonds wordt beheerd door het platform. Je kunt de instellingen bekijken; wijzigingen lopen via Wunderling."}
        </p>
      </div>

      <BrandingSection model={model} canWrite={canWrite} />
      <AccountsSection model={model} canWrite={canWrite} />
      <ManageSection model={model} canWrite={canWrite} />
    </div>
  );
}

function BrandingSection({ model, canWrite }: { model: SettingsModel; canWrite: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Huisstijl</h3>
        <p className="mt-1 text-sm text-text-muted">
          Kleur, accent, radius en logo voor alle agents van dit fonds. Geen per-agent override.
        </p>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        {canWrite ? (
          <BrandingForm fundKey={model.fundKey} theme={model.theme} agentNames={model.agentNames} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-text-muted">Primaire kleur</dt>
                <dd className="font-mono text-text">{model.theme.primary ?? "n.n.b."}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Accentkleur</dt>
                <dd className="font-mono text-text">{model.theme.accent ?? "n.n.b."}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Radius</dt>
                <dd className="font-mono text-text">{model.theme.radius ?? "n.n.b."}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Logo-URL</dt>
                <dd className="break-all text-text">{model.theme.logo ?? "n.n.b."}</dd>
              </div>
            </dl>
            <BrandingPreview theme={model.theme} />
          </div>
        )}
      </Card>
    </section>
  );
}

function AccountsSection({ model, canWrite }: { model: SettingsModel; canWrite: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Accounts</h3>
        <p className="mt-1 text-sm text-text-muted">
          Wachtwoorden zijn niet in te zien — alleen resetten. Het nieuwe wachtwoord wordt één keer
          getoond.
        </p>
      </div>
      {model.accounts.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen fondsaccounts.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {model.accounts.map((user) => (
            <Card key={user.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{user.email}</span>
                <Chip variant="caution">{user.role}</Chip>
                {user.mustChangePassword ? (
                  <Chip variant="caution">Moet wachtwoord wijzigen</Chip>
                ) : null}
              </div>
              {canWrite ? (
                <>
                  <ChangeEmailForm fundKey={model.fundKey} userId={user.id} email={user.email} />
                  <ResetPasswordForm fundKey={model.fundKey} userId={user.id} email={user.email} />
                </>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      {canWrite && model.active ? (
        <Card className="p-5">
          <h4 className="text-sm font-semibold">Extra fondsaccount</h4>
          <p className="mt-1 mb-3 text-sm text-text-muted">Alleen platform-admin. Geen wachtwoord-inzage.</p>
          <AddUserForm fundKey={model.fundKey} />
        </Card>
      ) : null}
    </section>
  );
}

function ManageSection({ model, canWrite }: { model: SettingsModel; canWrite: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Fondsbeheer</h3>
        <p className="mt-1 text-sm text-text-muted">Weergavenaam, schema-dump en deactiveren.</p>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        <h4 className="text-sm font-semibold">Weergavenaam</h4>
        {canWrite ? (
          <UpdateNameForm fundKey={model.fundKey} name={model.displayName} />
        ) : (
          <p className="text-sm text-text">
            {model.displayName}{" "}
            <span className="font-mono text-text-muted">({model.fundKey})</span>
          </p>
        )}
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <h4 className="text-sm font-semibold">Dump en deactiveren</h4>
        <p className="text-sm text-text-muted">
          <code className="font-mono">pg_dump --no-owner --no-acl -n {model.schemaName}</code>. De
          audit bewaart alleen omvang en sha256, niet de dump zelf.
        </p>
        {model.latestDump ? (
          <p className="text-sm text-text">
            Laatste dump: {dateTime.format(model.latestDump.occurredAt)}
            {model.latestDump.bytes !== null
              ? ` · ${model.latestDump.bytes.toLocaleString("nl-NL")} bytes`
              : ""}
            {model.latestDump.sha256 ? (
              <>
                {" "}
                · sha256{" "}
                <code className="font-mono text-xs">{model.latestDump.sha256.slice(0, 12)}…</code>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-text-muted">Nog geen dump-auditregel voor dit fonds.</p>
        )}
        {canWrite ? <DumpForm fundKey={model.fundKey} /> : null}
      </Card>
      {canWrite && model.active ? (
        <Card className="p-5">
          <DeactivateForm fundKey={model.fundKey} hasDump={model.latestDump !== null} />
        </Card>
      ) : null}
    </section>
  );
}
