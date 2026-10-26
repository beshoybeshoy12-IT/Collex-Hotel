# Arabic / English localisation

- **Default language: Arabic.** `/` redirects to `/ar` unless the visitor previously chose English (`NEXT_LOCALE` cookie). Staff preferences are also stored on the user (`PUT /v1/auth/me/locale`).
- **Routing:** every page exists as `/ar/...` and `/en/...`. Deep links, refreshes and back/forward keep the language. The language switcher keeps the current path and query string.
- **Direction:** `<html lang="ar" dir="rtl">` / `<html lang="en" dir="ltr">`. Components use logical utilities (`ms-/me-/ps-/pe-/start-/end-/text-start`). Directional icons are mirrored with `rtl:rotate-180` only where the meaning is directional.
- **Mixed text:** identifiers (confirmation numbers, e-mails, phones, passport numbers, room numbers) are wrapped in `<bdi dir="ltr">` (`<Ltr>` component) and entered with `LtrInput`.
- **Messages:** `apps/web/messages/{ar,en}.json`. Keys are typed (`global.d.ts`), so a missing key fails `tsc`. Tests (`apps/web/test/i18n.test.ts`) check identical key sets, no empty values, matching ICU placeholders, Arabic values that actually contain Arabic, and that every literal key used in the source exists.
- **API errors** are stable codes (e.g. `DOCUMENTS_INCOMPLETE`) translated in the UI (`errors.*`).
- **Formatting:** `useFormat()` uses `Intl` with `ar-u-ca-gregory-nu-latn` (or `nu-arab` when the property enables Arabic-Indic digits) and `en-GB`. Business dates are formatted as calendar dates (no time-zone shift); timestamps use the property time zone. Currency comes from the property.
- **Arabic plurals:** ICU plural categories (zero/one/two/few/many/other) are used, e.g. `common.nights`.
- **Font:** IBM Plex Sans Arabic (Arabic + Latin) through `next/font`, with correct shaping and ligatures.
- **Charts:** axes are reversed and Y-axes moved for RTL.
- **Floor plans** are physical maps and are intentionally not mirrored.
- **Notifications:** every template has Arabic and English versions. The guest's preferred language is used, and HTML e-mails carry `lang` and `dir`.
- **Printed documents / PDFs:** rendered as HTML in the browser, so print → Save as PDF keeps Arabic shaping, ligatures and RTL tables correct.

To add a language: add `messages/<code>.json` with the same keys, add the code to `src/i18n/config.ts` and `Locale` in `packages/shared/src/enums.ts`, and add notification templates.
