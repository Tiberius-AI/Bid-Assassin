import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/supabase";
import { toast } from "react-hot-toast";
import { Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { profile, company, refreshProfile, refreshCompany } = useSession();
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");

  // Company fields
  const [companyName, setCompanyName] = useState(company?.name || "");
  const [address, setAddress] = useState(company?.address || "");
  const [city, setCity] = useState(company?.city || "");
  const [state, setState] = useState(company?.state || "");
  const [zip, setZip] = useState(company?.zip || "");
  const [companyPhone, setCompanyPhone] = useState(company?.phone || "");
  const [companyEmail, setCompanyEmail] = useState(company?.email || "");
  const [website, setWebsite] = useState(company?.website || "");
  const [paymentTerms, setPaymentTerms] = useState(company?.default_payment_terms || "");
  const [warrantyTerms, setWarrantyTerms] = useState(company?.default_warranty_terms || "");
  const [proposalTone, setProposalTone] = useState(company?.proposal_tone || "professional");

  const handleSave = async () => {
    if (!profile || !company) return;
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
        .eq("id", profile.id);
      if (profileError) throw profileError;

      // Update company
      const { error: companyError } = await supabase
        .from("companies")
        .update({
          name: companyName,
          address,
          city,
          state,
          zip,
          phone: companyPhone,
          email: companyEmail,
          website,
          default_payment_terms: paymentTerms,
          default_warranty_terms: warrantyTerms,
          proposal_tone: proposalTone,
        })
        .eq("id", company.id);
      if (companyError) throw companyError;

      await refreshProfile();
      await refreshCompany();
      toast.success("Settings saved!");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and company settings.
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={profile?.email || ""} disabled className="bg-gray-50" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Company Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Company</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            <div>
              <Label>Company Phone</Label>
              <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
            </div>
            <div>
              <Label>Company Email</Label>
              <Input value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Proposal Preferences */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Proposal Defaults
          </h2>
          <div className="space-y-4">
            <div>
              <Label>Proposal Tone</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(["professional", "friendly", "aggressive"] as const).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setProposalTone(tone)}
                    className={`px-4 py-2 rounded-lg border text-sm capitalize transition-colors ${
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
              <Label>Default Payment Terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>
            <div>
              <Label>Default Warranty Terms</Label>
              <Textarea value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} rows={3} />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-red-600 hover:bg-red-700"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
