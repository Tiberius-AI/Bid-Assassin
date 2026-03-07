import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/context/SessionContext";
import supabase from "@/supabase";
import { fetchContentFromUrl } from "@/services/ai";
import {
  Crosshair,
  Building2,
  Wrench,
  Shield,
  BookOpen,
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
  Globe,
  Loader2,
} from "lucide-react";

const STEPS = [
  { icon: Building2, label: "Company" },
  { icon: Wrench, label: "Your Trade" },
  { icon: Shield, label: "License & Insurance" },
  { icon: BookOpen, label: "Company Profile" },
  { icon: Settings, label: "Preferences" },
];

export default function Onboarding() {
  const { session, profile, refreshProfile, refreshCompany } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fetchingAbout, setFetchingAbout] = useState(false);
  const [fetchingTerms, setFetchingTerms] = useState(false);

  useEffect(() => {
    if (session && profile?.onboarding_completed) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, profile, navigate]);

  // Step 0: Company Info
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Step 1: Trade & Certifications (fill-in)
  const [tradesText, setTradesText] = useState("");
  const [certsText, setCertsText] = useState("");

  // Step 2: License & Insurance
  const [licenseNumber, setLicenseNumber] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState("");

  // Step 3: Company Profile
  const [aboutUs, setAboutUs] = useState("");
  const [aboutUsUrl, setAboutUsUrl] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [tcUrl, setTcUrl] = useState("");

  // Step 4: Preferences
  const [proposalTone, setProposalTone] = useState<"professional" | "friendly" | "aggressive">("professional");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [warrantyTerms, setWarrantyTerms] = useState("1 year workmanship warranty");

  // Pre-fill the About URL with website when reaching step 3
  useEffect(() => {
    if (step === 3 && website && !aboutUsUrl) {
      setAboutUsUrl(website);
    }
  }, [step, website, aboutUsUrl]);

  const handleFetchAbout = async () => {
    const url = (aboutUsUrl.trim() || website).trim();
    if (!url) { toast.error("Enter a URL first"); return; }
    setFetchingAbout(true);
    try {
      const content = await fetchContentFromUrl(url, "about");
      if (content) { setAboutUs(content); toast.success("About Us imported!"); }
      else toast.error("Could not extract content from that URL");
    } catch {
      toast.error("Failed to import from URL");
    } finally {
      setFetchingAbout(false);
    }
  };

  const handleFetchTerms = async () => {
    const url = tcUrl.trim();
    if (!url) { toast.error("Enter a URL first"); return; }
    setFetchingTerms(true);
    try {
      const content = await fetchContentFromUrl(url, "terms");
      if (content) { setTermsAndConditions(content); toast.success("Terms imported!"); }
      else toast.error("Could not extract content from that URL");
    } catch {
      toast.error("Failed to import from URL");
    } finally {
      setFetchingTerms(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return companyName.trim().length > 0;
    if (step === 1) return tradesText.trim().length > 0;
    return true;
  };

  const handleFinish = async () => {
    if (!session?.user?.id) return;
    setSaving(true);

    const trades = tradesText.split(",").map((t) => t.trim()).filter(Boolean);
    const certifications = certsText.split(",").map((c) => c.trim()).filter(Boolean);

    try {
      const userId = session.user.id;

      const { data: existingCompany, error: checkError } = await supabase
        .from("companies")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();

      if (checkError) console.error("Company check error:", checkError);

      const companyData = {
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
        company_bio: aboutUs,
        default_terms: termsAndConditions,
      };

      if (existingCompany) {
        const { error } = await supabase
          .from("companies")
          .update(companyData)
          .eq("profile_id", userId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("companies")
          .insert({ profile_id: userId, ...companyData });
        if (error) throw new Error(error.message);
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", userId);
      if (profileError) throw new Error(profileError.message);

      await refreshProfile();
      await refreshCompany();
      toast.success("Setup complete! Welcome to Bid Assassin.");
      setTimeout(() => navigate("/dashboard"), 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save. Please try again.";
      toast.error(message);
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

          {/* Step 0: Company Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Company Information</h2>
                <p className="text-sm text-gray-500 mt-1">Tell us about your business.</p>
              </div>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Smith Roofing LLC"
                  />
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
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@smithroofing.com" />
                  </div>
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://smithroofing.com" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Trade & Certifications */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Your Trade</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Tell us what your company does. The AI uses this to write accurate, trade-specific proposals.
                </p>
              </div>
              <div>
                <Label htmlFor="tradesText">Trade(s) *</Label>
                <Input
                  id="tradesText"
                  value={tradesText}
                  onChange={(e) => setTradesText(e.target.value)}
                  placeholder="e.g., Roofing, HVAC, Sheet Metal"
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  List your primary trade(s), separated by commas.
                </p>
              </div>
              <div>
                <Label htmlFor="certsText">Certifications</Label>
                <Textarea
                  id="certsText"
                  value={certsText}
                  onChange={(e) => setCertsText(e.target.value)}
                  placeholder="e.g., OSHA 10, EPA Lead-Safe, MBE, HUBZone"
                  rows={3}
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Any certifications your company holds, separated by commas. Leave blank if none.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: License & Insurance */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">License & Insurance</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Optional but recommended. Builds trust and is often required for commercial bids.
                </p>
              </div>
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

          {/* Step 3: Company Profile */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Company Profile</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Your About Us and Terms appear on every proposal.
                  {website ? " We can import them straight from your website — just click Import." : " Type them below or skip and fill in later."}
                </p>
              </div>

              {/* About Us */}
              <div>
                <Label className="mb-1 block">About Us</Label>
                <p className="text-xs text-gray-400 mb-2">Company story, experience, specialties, and values.</p>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={aboutUsUrl}
                    onChange={(e) => setAboutUsUrl(e.target.value)}
                    placeholder={website || "https://yourwebsite.com/about"}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={fetchingAbout || (!aboutUsUrl.trim() && !website)}
                    onClick={handleFetchAbout}
                    className="gap-1.5 shrink-0"
                  >
                    {fetchingAbout ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {fetchingAbout ? "Importing..." : "Import from URL"}
                  </Button>
                </div>
                <Textarea
                  value={aboutUs}
                  onChange={(e) => setAboutUs(e.target.value)}
                  rows={5}
                  placeholder="Describe your company, years in business, specialties, and what makes you stand out..."
                />
              </div>

              {/* Terms & Conditions */}
              <div>
                <Label className="mb-1 block">Terms & Conditions</Label>
                <p className="text-xs text-gray-400 mb-2">Default T&C for your proposals — editable per proposal.</p>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={tcUrl}
                    onChange={(e) => setTcUrl(e.target.value)}
                    placeholder="https://yourwebsite.com/terms"
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={fetchingTerms || !tcUrl.trim()}
                    onClick={handleFetchTerms}
                    className="gap-1.5 shrink-0"
                  >
                    {fetchingTerms ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {fetchingTerms ? "Importing..." : "Import from URL"}
                  </Button>
                </div>
                <Textarea
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  rows={6}
                  placeholder="Enter your standard terms and conditions, or import from your website..."
                />
              </div>
            </div>
          )}

          {/* Step 4: Preferences */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Proposal Preferences</h2>
                <p className="text-sm text-gray-500 mt-1">Set your default proposal style. You can change these per-proposal later.</p>
              </div>
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

          {/* Navigation */}
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
