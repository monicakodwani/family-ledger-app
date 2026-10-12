import { Landmark, KeyRound, Mail, Smartphone, Apple, PhoneOff } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/ui/card";
import type { ReactNode } from "react";

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-ink/90">{children}</div>
    </Card>
  );
}

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="If a phone is lost or stolen" back />
      <p className="mb-5 text-muted">
        Family Ledger never holds passwords, so signing it out protects only Family Ledger. These separate steps protect
        everything else. Do the ones that apply.
      </p>
      <div className="space-y-4">
        <Step icon={<PhoneOff aria-hidden className="size-5" />} title="1. Block the SIM">
          <p>
            Call your mobile operator to block the SIM, so OTPs can't be received on the lost phone. Ask for a
            replacement SIM with the same number.
          </p>
        </Step>
        <Step icon={<Apple aria-hidden className="size-5" />} title="2. Apple ID / Find My">
          <p>
            From another device, open Find My (or icloud.com/find), mark the phone as lost, and erase it if it won't be
            recovered. Change the Apple ID password.
          </p>
        </Step>
        <Step icon={<Landmark aria-hidden className="size-5" />} title="3. Banks and brokers">
          <p>
            Call each bank's official helpline (number on the back of your card or on the official website) to block
            cards, UPI and net banking on that phone.
          </p>
          <p>
            Brokers and fund apps (Groww, ICICI Direct and others): sign out of other devices from their settings, or
            call their support.
          </p>
        </Step>
        <Step icon={<Mail aria-hidden className="size-5" />} title="4. Email">
          <p>Change your email password and sign out of other devices from your email account's security settings.</p>
        </Step>
        <Step icon={<KeyRound aria-hidden className="size-5" />} title="5. Password manager">
          <p>
            Change the master password of your password manager (Bitwarden, 1Password) and remove the lost device from
            its list of devices.
          </p>
        </Step>
        <Step icon={<Smartphone aria-hidden className="size-5" />} title="6. Family Ledger">
          <p>
            Sign out the lost phone from Security → My devices, or ask a family member to pause your access. Two family
            members must approve a pause.
          </p>
        </Step>
      </div>
    </div>
  );
}
