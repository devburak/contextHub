# Sign in with Google

ContextHub Cloud admin users can sign in to `ctxhub.net` with a Google account instead of typing a password. Google sign-in is an additional login method for people; it does not replace API tokens and does not change tenant roles or permissions.

## Quick facts

| Question | Answer |
| --- | --- |
| Where is it available? | On the ContextHub Cloud admin login and sign-up pages, and on the Profile page for linking. |
| Which plans include it? | All plans, including Free. It is an account feature, not a tenant entitlement. |
| What does Google share? | Basic identity only: `openid`, `email`, and `profile`. |
| Does it grant Google Drive access? | No. Drive is a separate consent used only by [tenant backup](./tenant-backup.md). |
| Is a password still supported? | Yes. Email and password login keeps working alongside Google. |
| Is it enterprise SAML or a custom OIDC provider? | No. It is Google account sign-in for individual users. |

## How do I sign in with Google?

1. Open the ContextHub Cloud login page and choose **Sign in with Google**.
2. Pick a Google account and approve the identity consent.
3. ContextHub verifies the Google response and opens an admin session.

The resulting session is the same HttpOnly cookie session described in [Authentication and tenancy](./authentication.md). Tenant membership, roles, and permissions apply exactly as they do after a password login.

## What happens the first time?

- **No ContextHub account uses that email yet:** a new account is created with the name and email from Google, and the email is marked as verified. The account has no tenant until you create one or accept an invitation.
- **A ContextHub account already uses that email:** Google sign-in is refused until you link the accounts yourself. Sign in with your password, open **Profile**, and choose **Link your Google account**. This prevents someone from taking over an existing account by controlling a matching address.

## How do I link or unlink a Google account?

Linking and unlinking happen on the **Profile** page of the admin.

- **Link:** choose **Link your Google account** while signed in. The Google account's verified email must match your ContextHub account email. One Google account can be linked to one ContextHub account.
- **Unlink:** choose **Unlink account** and confirm with your current password. If the account was created through Google and you never set a password, use the password reset flow first, then unlink.

After unlinking, the account signs in with email and password only.

## What does ContextHub check?

- Authorization code flow with PKCE (`S256`), a single-use `state` value bound to the browser, and a `nonce`. A sign-in attempt expires after ten minutes.
- The Google ID token signature, issuer, audience, expiry, and nonce.
- Google must report the email as verified.
- Disabled accounts, and accounts that must change their password first, cannot sign in through Google.
- Linking is rejected when the session was revoked or the account changed while the flow was in progress.

ContextHub stores Google's stable account identifier to recognise you on the next sign-in. It does not store a Google access token or refresh token for sign-in.

## What Google sign-in is not

- **Not an API credential.** Server integrations, build pipelines, and migrations keep using `ctx_...` API tokens. See [API token lifecycle](./api-token-lifecycle.md).
- **Not sign-in for your own site visitors.** It authenticates ContextHub admin users, not the end users of the sites you build on the API.
- **Not tenant-level SSO.** There is no per-tenant identity provider, domain restriction, or enforced SSO policy. Access is still controlled by [roles and permissions](./roles-permissions.md).

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| "You already have an account with this email" | Sign in with your password, then link Google from Profile. |
| Linking fails | Make sure the Google account email equals your ContextHub account email, then try again. |
| "Google authorization could not be completed" | The attempt expired, consent was cancelled, or the browser blocked the flow cookie. Start again from the login page. |
| The Google button is not shown | Google sign-in is not enabled on that deployment. Self-hosted installations must configure their own Google OAuth client. |
