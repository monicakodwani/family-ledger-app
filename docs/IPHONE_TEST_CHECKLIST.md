# iPhone manual test checklist

Automated tests run Playwright's WebKit engine at an iPhone 14 viewport. That is **not** real iOS Safari: Face ID, passkeys, Add to Home Screen, the iOS keyboard and safe areas must be checked on a real device. Use this list on each family member's iPhone (iOS 17+).

Record: device model, iOS version, date, tester, pass/fail per line.

## Install and launch

- [ ] Open the site in Safari; the page loads with no horizontal scrolling.
- [ ] Share → Add to Home Screen shows the name "Family Ledger" and the correct icon.
- [ ] Launching from the Home Screen opens full-screen (no Safari toolbar), with a suitable splash/background colour.
- [ ] The status bar and the bottom tab bar don't overlap the notch or home indicator.

## Sign-in (connected mode)

- [ ] Invitation link opens the app signed in.
- [ ] "Set up Face ID sign-in" creates a passkey (visible in Settings → Passwords).
- [ ] Closing the app fully and reopening asks for Face ID, then shows Home.
- [ ] "Email me a sign-in link" works and returns to the app.
- [ ] After 60 minutes idle, the app asks to sign in again.
- [ ] "Show details" on an account asks for Face ID if the last sign-in was more than 5 minutes ago.

## Everyday use (do these as Mumma would)

- [ ] Text is comfortably readable at the default size; "Large" and "Extra large" text settings work.
- [ ] All buttons can be tapped with a thumb without mis-taps; the tab bar is reachable one-handed.
- [ ] Update an amount by typing "12 lakh": the preview shows ₹12,00,000; saving shows a confirmation.
- [ ] The number keyboard appears for amounts; inputs don't zoom the page when focused.
- [ ] The date picker shows Indian date order.
- [ ] Add a note, edit it, and see "edited" with the earlier wording available.
- [ ] Create a plan, add a thought, record a decision, and have another member tap "I agree".
- [ ] Archive an account and restore it.
- [ ] Official website links open in Safari and the app is still there when returning.
- [ ] VoiceOver: Home, an account page and the Update amount sheet are announced sensibly; charts have text alternatives.
- [ ] Dark mode / Smart Invert don't make anything unreadable.

## Security

- [ ] Airplane mode: the app shows the friendly offline message and no financial data.
- [ ] Sign out → reopen: no financial data visible before signing in.
- [ ] Revoke the phone from another device: the next action on the phone shows "This device was signed out".
- [ ] Emergency pause from two other members: the paused phone can no longer see data, even after Face ID.
