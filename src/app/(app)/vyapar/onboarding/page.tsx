import { AppBar } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { OnboardingForm } from "@/components/vyapar/onboarding-form";
import { getOnboarding, QUESTIONS } from "@/lib/vyapar/server/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const o = await getOnboarding();
  return <div className="page">
    <AppBar title="About your business" sub="So your AI sales team knows what to sell and to whom" back="/vyapar/fleet" />
    <main className="scroll"><div className="pad">
      <OnboardingForm questions={QUESTIONS} initial={o.answers as Record<string, string>} brief={o.brief} provider={o.provider} saved={o.saved} />
    </div></main>
    <VyaparTabs />
  </div>;
}
