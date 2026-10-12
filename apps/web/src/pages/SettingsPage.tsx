import { useState } from "react";
import { Languages, Type } from "lucide-react";
import { PageHeader } from "../components/AppShell";
import { Card, SectionTitle } from "../components/ui/card";
import { ChoiceGroup } from "../components/ui/field";
import { useToast } from "../components/Toaster";
import { getTextSize, setTextSize, type TextSize } from "../lib/prefs";
import { IS_DEMO } from "../env";
import { t } from "../i18n";

export default function SettingsPage() {
  const [size, setSize] = useState<TextSize>(getTextSize());
  const toast = useToast();
  return (
    <div>
      <PageHeader title={t("page.settings")} back="/more" />
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <Type aria-hidden className="size-5" /> Text size
        </span>
      </SectionTitle>
      <Card>
        <ChoiceGroup
          name="textSize"
          legend="Choose what's comfortable to read"
          value={size}
          onChange={(v) => {
            setSize(v);
            setTextSize(v);
            toast.success("Text size changed on this device.");
          }}
          options={[
            { value: "normal", label: <span className="text-[17px]">Normal</span> },
            { value: "large", label: <span className="text-[19px]">Large</span> },
            { value: "xlarge", label: <span className="text-[21px]">Extra large</span> },
          ]}
        />
      </Card>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <Languages aria-hidden className="size-5" /> Language
        </span>
      </SectionTitle>
      <Card>
        <ChoiceGroup
          name="language"
          legend="Language"
          value="en"
          onChange={() => undefined}
          options={[
            { value: "en", label: "English" },
            { value: "hi", label: "हिन्दी (Hindi)", hint: "Coming soon" },
          ]}
        />
        <p className="mt-3 text-[0.9375rem] text-muted">
          Hindi is being prepared and will appear here when it's ready.
        </p>
      </Card>
      <p className="mt-8 px-1 text-[0.9375rem] text-muted">
        Family Ledger {IS_DEMO ? "demo" : ""} · Settings here are only remembered on this device. No family money
        details are stored on the phone.
      </p>
    </div>
  );
}
