import { Card, Chip } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { getFundCached, listFundUsersCached } from "@/lib/fund-lookups";
import { parseFundKey } from "@/lib/route-params";
import { AddUserForm, ChangeEmailForm, ResetPasswordForm } from "../../manage-forms";

export default async function FundAccountsPage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const fund = await getFundCached(fundKey);
  if (!fund) notFound();

  const accounts = await listFundUsersCached(fundKey);
  const active = fund.status === "active";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Wachtwoorden zijn niet in te zien — alleen resetten. Het nieuwe wachtwoord wordt één keer
        getoond.
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen fondsaccounts.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {accounts.map((user) => (
            <Card key={user.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{user.email}</span>
                <Chip variant="caution">{user.role}</Chip>
                {user.mustChangePassword ? (
                  <Chip variant="caution">Moet wachtwoord wijzigen</Chip>
                ) : null}
              </div>
              <ChangeEmailForm fundKey={fund.key} userId={user.id} email={user.email} />
              <ResetPasswordForm fundKey={fund.key} userId={user.id} email={user.email} />
            </Card>
          ))}
        </div>
      )}
      {active ? (
        <Card className="p-5">
          <h4 className="text-sm font-semibold">Extra fondsaccount</h4>
          <p className="mt-1 mb-3 text-sm text-text-muted">Alleen platform-admin. Geen wachtwoord-inzage.</p>
          <AddUserForm fundKey={fund.key} />
        </Card>
      ) : null}
    </div>
  );
}
