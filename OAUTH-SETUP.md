# OAuth setup (Google) — console steps

Targeting **web (Vercel)** + **Android (Google Play)** for now. iOS / App Store / Apple Sign-In are **deferred** (Apple Developer enrollment is $99/yr). Since we're not shipping iOS, Google-only OAuth is fine — the "must also offer Sign in with Apple" rule only applies to iOS App Store apps.

Open signup is enabled: any Google user can sign in and is sent to onboarding (no groups until invited/joined).

Code is done (web + mobile Google buttons, browser flow, mobile onboarding for new users, new-user gate). **Nothing works until the steps below are configured.**

## 1. Google Cloud
1. console.cloud.google.com → APIs & Services → Credentials → Create **OAuth client ID** (type: Web application).
2. Authorized redirect URI: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
3. Copy the **Client ID** + **Client Secret**.

## 2. Supabase → Authentication → Providers → Google
- Enable, paste Client ID + Secret.

## 3. Supabase → Authentication → URL Configuration → Redirect URLs
Add:
- `https://coldsoup.kallsup.se/auth/callback` (web prod)
- `http://localhost:3000/auth/callback` (web dev)
- `coldsoup://auth-callback` (Android standalone build)
- `exp://**` (Expo Go / dev — optional)

## 4. Already in place (code/config)
- Mobile scheme `coldsoup` (app.json) → deep link `coldsoup://auth-callback`.
- `NEXT_PUBLIC_APP_URL` = prod domain on Vercel.
- New users → onboarding screen (set display name) → Groups tab.

## Deferred until Apple Developer account ($99/yr)
- iOS builds, TestFlight, App Store submission.
- Sign in with Apple (button code exists but is hidden; the `handleOAuth("apple")` path remains for easy re-enable).

## Distribution now
- **Web:** Vercel, custom domain `coldsoup.kallsup.se`.
- **Android:** EAS build → Google Play ($25 one-time). `eas build --profile production --platform android`.

## Still do before publish
- Verify a Resend sending domain (invites currently use the dev sandbox sender).
- Auth hardening in WEB-PARITY-STATUS.md (refresh-token reuse detection, leaked-password protection, rate limits).
