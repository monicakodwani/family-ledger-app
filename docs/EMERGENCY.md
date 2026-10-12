# Emergency procedures

Print this page and keep it with the family's important papers.

Family Ledger can only lock **Family Ledger**. A lost phone usually also gives access to email, banking apps, WhatsApp and the password manager. Work through every section that applies.

## 1. My own phone is lost or stolen

1. On any other device (a family member's phone is fine — sign in as yourself), open Family Ledger → **More → Security → Sign out everywhere**. Confirm with Face ID / your passkey.
2. Continue with section 3.

## 2. A family member's phone is lost or stolen

1. Open Family Ledger → **More → Security → A family member's phone was lost or stolen**. Choose who, and write a short reason.
2. Ask **one other family member** to open Family Ledger → More → Security and tap **Approve**. Two people are needed so that no one can lock someone out alone. The person whose phone was lost cannot approve or cancel (in case a thief has their phone).
3. Their account is now paused and signed out on every device.
4. When they have a safe phone again, any member requests **Unpause**, a second member approves, and they sign in again (and set up Face ID again).

## 3. Outside Family Ledger — do these too

| System                                       | What to do                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple ID / iCloud**                        | From another device: iCloud.com → Find My → mark the phone as lost / erase it. Change the Apple ID password. Passkeys live in iCloud Keychain, so securing the Apple ID protects them. |
| **Mobile number / SIM**                      | Call the operator to block the SIM. OTPs for banks go to this number.                                                                                                                  |
| **Email**                                    | Change the password and sign out other sessions (Gmail: Security → Your devices). Family Ledger sign-in links go to email.                                                             |
| **Banks and brokers**                        | Call each institution's official helpline (numbers in the account's "Sign-in & access" section) to block mobile banking / UPI. Change login passwords.                                 |
| **Password manager (Bitwarden / 1Password)** | Change the master password, deauthorise sessions, and review the shared family vault.                                                                                                  |
| **WhatsApp**                                 | Re-register WhatsApp on a new phone with the same number; enable two-step verification.                                                                                                |

## 4. If you think someone has seen Family Ledger data

1. Sign everyone out (section 1 for each person).
2. Look at **More → Activity** for anything unexpected.
3. Tell the person who administers Cloudflare and GitHub. They should check those accounts' security logs and consider rotating the encryption key (DEPLOYMENT.md §11).

## 5. If Family Ledger itself is unavailable

Your information is safe in the encrypted private repository. Ask the administrator to check the Cloudflare Worker and Supabase project status (a free Supabase project pauses after a week without use and must be resumed from its dashboard).
