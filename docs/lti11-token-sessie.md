# LTI 1.1 — token-sessie (Safari-proof launch)

Operationele en security-notities bij de token-gebaseerde LTI-sessie. Code:
`apps/runtime/lib/lti11/session-token.ts`, `launch.ts`, `request-auth.ts`,
`apps/roleplay/lib/lti-token.ts` en `apps/roleplay/components/lti-session-keeper.tsx`.

Qonvo-bron: `qonvo/docs/lti11-token-sessie.md`. Wunderstack porteert de token-flow, niet de
cookie-flow, en niet de versleutelde Supabase-sessie: er zijn geen leerlingaccounts (R3).

## Waarom een token i.p.v. een cookie

Safari stuurt in een third-party LMS-iframe geen `SameSite=None`-cookie mee en negeert
`Partitioned` (CHIPS). De LTI-sessie kan daar dus niet via een cookie reizen. In plaats daarvan
krijgt de client een **kort-levend, getekend LTI-token** dat enkel naar de
`control.lti11_launches`-rij verwijst (`lid` + `exp`). Geen `uid`, geen e-mail.

## Residuele XSS-impact (bewuste trade-off)

Omdat het token niet in een cookie kan zitten, reist het via:

- de **URL-query** (`?ltiToken=…`) bij de post-launch redirect,
- de `x-lti-token` **request-header** (client-fetches naar `/api/roleplay/*`),
- **`sessionStorage`** (na het strippen uit de URL, zie `LtiSessionKeeper`).

Daarmee is het token **JS-bereikbaar** en dus in theorie XSS-exfiltreerbaar — anders dan een
`HttpOnly`-cookie. Mitigaties:

- **Korte TTL.** 4 uur, gelijk aan de launch-vervaltijd. Verhoog die niet zonder reden.
- **Launch-binding.** Het token bevat alleen `lid` + `exp`. Bij inwisseling wordt de launch
  geladen: hij moet bestaan, niet verlopen zijn, en de consumer moet actief zijn. Start dwingt
  het scenario en het fonds van die launch af; de client mag `origin` / `resultTarget` /
  `externalUserRef` niet zetten.
- **URL-hygiëne.** `LtiSessionKeeper` verplaatst het token naar `sessionStorage`.
  `apps/roleplay` zet `Referrer-Policy: no-referrer` zodat het niet via `Referer` naar
  cross-origin subresources lekt.
- **CSP blijft strak.** Nonce + `strict-dynamic`, geen `'unsafe-inline'` op scripts
  (`apps/roleplay/lib/csp.ts`). Maak de CSP niet soepeler "zodat LTI werkt".

## Wat we niet overnemen uit Qonvo

- Cookie-launch (`SameSite=None; Partitioned`).
- `lti11_sessions` / AES-encrypted Supabase tokens / refresh-dedup.
- `lti11_user_mappings` en e-mail-autolink. `user_id` wordt HMAC'd voordat hij landt;
  `lis_person_name_*` en `lis_person_contact_email_primary` worden niet gelezen.
- `lti11_grade_links` als aparte tabel — de Fase 7-outbox + `result_target.kind = "lti11"`
  is dezelfde naad.
- Leerpad-launch (`/leerpad/…`). v1 is alleen `gesprek/<slug>`.

## Env

- `ROLEPLAY_PUBLIC_URL` — publieke origin van `apps/roleplay`. OAuth-signatures en de redirect
  gebruiken deze host, niet de interne rewrite-host van de runtime.
- `LTI_SESSION_SECRET` — HMAC voor het sessietoken (min. 16 tekens). Zonder deze vars geeft
  launch 503.

Nonce-claim is atomair (`control.acquire_lti11_nonce`). Faalt iets ná de claim (ontbrekend
scenario, insert, token-mint), dan wordt de nonce vrijgegeven zodat een browser-retry niet als
replay sneuvelt.
