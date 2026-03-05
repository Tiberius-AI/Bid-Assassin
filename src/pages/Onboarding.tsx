import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/context/SessionContext";
import supabase from "@/supabase";
import {
  Crosshair,
  Building2,
  Wrench,
  Award,
  Shield,
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";

const TRADE_OPTIONS = [
  "Painting",
  "Drywall",
  "Flooring",
  "Carpentry",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Roofing",
  "Concrete",
  "Masonry",
  "Demolition",
  "Insulation",
  "Fire Protection",
  "Glass & Glazing",
  "Landscaping",
  "General Contracting",
];

const CERT_OPTIONS = [
  "MBE (Minority Business Enterprise)",
  "WBE (Women Business Enterprise)",
  "DBE (Disadvantaged Business Enterprise)",
  "SBE (Small Business Enterprise)",
  "SDVOB (Service-Disabled Veteran)",
  "HUBZone",
  "OSHA 10",
  "OSHA 30",
  "EPA Lead-Safe Certified",
  "LEED Certified",
];

const STEPS = [
  { icon: Building2, label: "Company" },
  { icon: Wrench, label: "Trades" },
  { icon: Award, label: "Certifications" },
  { icon: Shield, label: "License & Insurance" },
  { icon: Settings, label: "Preferences" },
];

export default function Onboarding() {
  const { session, refreshProfile, refreshCompany } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Company Info
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Step 2: Trades
  const [trades, setTrades] = useState<string[]>([]);

  // Step 3: Certifications
  const [certifications, setCertifications] = useState<string[]>([]);

  // Step 4: License & Insurance
  const [licenseNumber, setLicenseNumber] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState("");

  // Step 5: Preferences
  const [proposalTone, setProposalTone] = useState<"professional" | "friendly" | "aggressive">("professional");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [warrantyTerms, setWarrantyTerms] = useState("1 year workmanship warranty");

  const toggleTrade = (trade: string) => {
    setTrades((prev) =>
      prev.includes(trade) ? prev.filter((t) => t !== trade) : [...prev, trade]
    );
  };

  const toggleCert = (cert: string) => {
    setCertifications((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    );
  };

  const canAdvance = () => {
    if (step === 0) return companyName.trim().length > 0;
    if (step === 1) return trades.length > 0;
    return true;
  };

  const handleFinish = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      // Create company
      const { error: companyError } = await supabase.from("companies").insert({
        profile_id: session.user.id,
        name: companyName,
        address,
        city,
        state,
        zip,
        phone,
        email,
        website,
        trades,
        certifications,
        license_number: licenseNumber,
        insurance_provider: insuranceProvider,
        insurance_policy_number: insurancePolicyNumber,
        proposal_tone: proposalTone,
        default_payment_terms: paymentTerms,
        default_warranty_terms: warrantyTerms,
      });
      if (companyError) throw companyError;

      // Mark onboarding complete
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", session.user.id);
      if (profileError) throw profileError;

      await refreshProfile();
      await refreshCompany();

      toast.success("Setup complete! Welcome to Bid Assassin.");
      navigate("/dashboard");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-red-600" />
          <span className="font-bold text-gray-900 text-lg">Bid Assassin</span>
          <span className="text-gray-400 ml-2">Setup</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    i < step
                      ? "bg-red-600 text-white"
                      : i === step
                      ? "bg-red-100 text-red-600 border-2 border-red-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`text-sm hidden sm:inline ${
                    i === step ? "text-gray-900 font-medium" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block w-8 h-px bg-gray-200 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-xl mx-auto bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          {/* Step 1: Company Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Company Information</h2>
              <p className="text-sm text-gray-500">Tell us about your business.</p>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Smith Painting LLC" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="address">Street Address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dallas" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP</Label>
                    <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="75201" />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(214) 555-0100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@smithpainting.com" />
                  </div>
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.smithpainting.com" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Trades */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Trades You Perform</h2>
              <p className="text-sm text-gray-500">Select all that apply. This helps the AI generate accurate proposals.</p>
              <div className="grid grid-cols-2 gap-2">
                {TRADE_OPTIONS.map((trade) => (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleTrade(trade)}
                    className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                      trades.includes(trade)
                        ? "border-red-600 bg-red-50 text-red-700 font-medium"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {trade}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Certifications */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Certifications</h2>
              <p className="text-sm text-gray-500">Select any certifications your company holds. These will be highlighted in proposals.</p>
              <div className="grid grid-cols-1 gap-2">
                {CERT_OPTIONS.map((cert) => (
                  <button
                    key={cert}
                    type="button"
                    onClick={() => toggleCert(cert)}
                    className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                      certifications.includes(cert)
                        ? "border-red-600 bg-red-50 text-red-700 font-medium"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {cert}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: License & Insurance */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">License & Insurance</h2>
              <p className="text-sm text-gray-500">Optional but recommended. Builds trust with potential clients.</p>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="license">License Number</Label>
                  <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="e.g., TACLA12345" />
                </div>
                <div>
                  <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                  <Input id="insuranceProvider" value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} placeholder="e.g., State Farm" />
                </div>
                <div>
                  <Label htmlFor="insurancePolicy">Policy Number</Label>
                  <Input id="insurancePolicy" value={insurancePolicyNumber} onChange={(e) => setInsurancePolicyNumber(e.target.value)} placeholder="e.g., POL-123456" />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Preferences */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Proposal Preferences</h2>
              <p className="text-sm text-gray-500">Set your default proposal style. You can change these per-proposal later.</p>
              <div className="grid gap-4">
                <div>
                  <Label>Proposal Tone</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {(["professional", "friendly", "aggressive"] as const).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setProposalTone(tone)}
                        className={`px-4 py-3 rounded-lg border text-sm capitalize transition-colors ${
                          proposalTone === tone
                            ? "border-red-600 bg-red-50 text-red-700 font-medium"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="paymentTerms">Default Payment Terms</Label>
                  <Input
                    id="paymentTerms"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Net 30"
                  />
                </div>
                <div>
                  <Label htmlFor="warrantyTerms">Default Warranty Terms</Label>
                  <Textarea
                    id="warrantyTerms"
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                    placeholder="1 year workmanship warranty"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance()}
                className="gap-1 bg-red-600 hover:bg-red-700"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={saving}
                className="gap-1 bg-red-600 hover:bg-red-700"
              >
                {saving ? "Saving..." : "Finish Setup"}
                {!saving && <Check className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
