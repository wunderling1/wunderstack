"use client";

import { Select } from "@wunderstack/ui";
import { usePathname, useRouter } from "next/navigation";
import { switchFundNavHref } from "@/lib/fund-nav";
import type { SwitcherOption } from "@/lib/switcher-options";

export function FundSwitcher({
  fundKey,
  options,
  disabled = false,
}: {
  fundKey: string;
  options: SwitcherOption[];
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select
      value={fundKey}
      aria-label="Ander fonds"
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (!next || next === fundKey) return;
        router.push(switchFundNavHref(pathname, fundKey, next));
      }}
    >
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.name}
        </option>
      ))}
    </Select>
  );
}
