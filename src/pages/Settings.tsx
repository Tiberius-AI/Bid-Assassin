import { useState, useRef, useEffect } from "react";
import { useSession } from "@/context/SessionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import supabase from "@/supabase";
import { toast } from "react-hot-toast";
import { Loader2, Save, Upload, X, Bell } from "lucide-react";

export default function SettingsPage() {
  const { profile, company, session, refreshProfile, refreshCompany } = useSession();
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // ---- Notification Preferences state ----
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [hotAlertThreshold, setHotAlertThreshold] = useState(80);
  const [minScoreThreshold, setMinScoreThreshold] = useState(50);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState("08:00");
  const [weeklyIntelEnabled, setWeeklyIntelEnabled] = useState(true);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("member_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEmailEnabled(data.email_enabled ?? true);
          setPushEnabled(data.push_enabled ?? false);
          setHotAlertThreshold(data.hot_alert_threshold ?? 80);
          setMinScoreThreshold(data.min_score_threshold ?? 50);
          setDigestEnabled(data.digest_enabled ?? true);
          setDigestTime(data.digest_time ?? "08:00");
          setWeeklyIntelEnabled(data.weekly_intel_enabled ?? true);
        }
        setNotifLoading(false);
      });
  }, [session?.user?.id]);

  const handleSaveNotifPrefs = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setNotifSaving(true);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        member_id: userId,
        email_enabled: emailEnabled,
        push_enabled: pushEnabled,
        hot_alert_threshold: hotAlertThreshold,
        min_score_threshold: minScoreThreshold,
        digest_enabled: digestEnabled,
        digest_time: digestTime,
        weekly_intel_enabled: weeklyIntelEnabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: "member_id" });
    setNotifSaving(false);
    if (error) {
      toast.error("Failed to save notification preferences");
    } else {
      toast.success("Notification preferences saved!");
    }
  };
  const [logoPreview, setLogoPreview] = useState<string | null>(company?.logo_url || null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
  const [companyBio, setCompanyBio] = useState(company?.company_bio || "");
  const [defaultTerms, setDefaultTerms] = useState(company?.default_terms || "");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Only PNG and JPG files are allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }

    setLogoUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${company.id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(path);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_url: publicUrl })
        .eq("id", company.id);
      if (updateError) throw updateError;

      setLogoPreview(publicUrl);
      await refreshCompany();
      toast.success("Logo uploaded!");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!company) return;
    setLogoUploading(true);
    try {
      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_url: null })
        .eq("id", company.id);
      if (updateError) throw updateError;

      setLogoPreview(null);
      await refreshCompany();
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  };

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
          company_bio: companyBio,
          default_terms: defaultTerms,
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

          {/* Logo Upload */}
          <div className="mb-5">
            <Label className="mb-2 block">Company Logo</Label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Company logo"
                    className="h-16 w-auto max-w-[160px] object-contain rounded border border-gray-200 bg-gray-50 p-1"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={logoUploading}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-teal-700 text-white flex items-center justify-center hover:bg-teal-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-16 w-32 rounded border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">
                  No logo
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="gap-2"
                >
                  {logoUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {logoUploading ? "Uploading..." : "Upload Logo"}
                </Button>
                <p className="text-xs text-gray-400 mt-1">PNG or JPG, max 2MB</p>
              </div>
            </div>
          </div>

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
                        ? "border-teal-700 bg-teal-50 text-teal-800 font-medium"
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
            <div>
              <Label>About Us</Label>
              <p className="text-xs text-gray-400 mb-1">Company bio, licenses, and certifications shown on proposals.</p>
              <Textarea value={companyBio} onChange={(e) => setCompanyBio(e.target.value)} rows={5} placeholder="Describe your company, experience, licenses, and certifications..." />
            </div>
            <div>
              <Label>Default Terms &amp; Conditions</Label>
              <p className="text-xs text-gray-400 mb-1">Boilerplate T&amp;C shown on proposals — can be edited per-proposal.</p>
              <Textarea value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)} rows={6} placeholder="Enter your standard terms and conditions..." />
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Control how The Prospector alerts you about new federal contract matches.
          </p>

          {notifLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Channels */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Notification Channels</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email Alerts</p>
                      <p className="text-xs text-gray-500">Hot alerts and daily digest via email</p>
                    </div>
                    <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Browser Push</p>
                      <p className="text-xs text-gray-500">Instant pop-up for hot matches (requires permission)</p>
                    </div>
                    <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 space-y-5">
                {/* Hot alert threshold */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Hot Alert Threshold</Label>
                    <span className="text-sm font-semibold text-teal-700">{hotAlertThreshold}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Matches at or above this score trigger an immediate notification.
                  </p>
                  <Slider
                    min={60}
                    max={95}
                    step={5}
                    value={[hotAlertThreshold]}
                    onValueChange={([v]) => setHotAlertThreshold(v)}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>60%</span><span>95%</span>
                  </div>
                </div>

                {/* Min score threshold */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Minimum Match Score</Label>
                    <span className="text-sm font-semibold text-gray-700">{minScoreThreshold}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Matches below this score won't appear in your feed.
                  </p>
                  <Slider
                    min={50}
                    max={75}
                    step={5}
                    value={[minScoreThreshold]}
                    onValueChange={([v]) => setMinScoreThreshold(v)}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>50%</span><span>75%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 space-y-4">
                {/* Daily digest */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Daily Digest Email</p>
                    <p className="text-xs text-gray-500">Summary of new matches sent once a day</p>
                  </div>
                  <Switch checked={digestEnabled} onCheckedChange={setDigestEnabled} />
                </div>
                {digestEnabled && (
                  <div className="ml-0 flex items-center gap-3">
                    <Label className="text-sm text-gray-600 shrink-0">Delivery time</Label>
                    <input
                      type="time"
                      value={digestTime}
                      onChange={(e) => setDigestTime(e.target.value)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
                    />
                  </div>
                )}

                {/* Weekly intel */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Weekly Intel Email</p>
                    <p className="text-xs text-gray-500">Monday morning market summary for your trades & region</p>
                  </div>
                  <Switch checked={weeklyIntelEnabled} onCheckedChange={setWeeklyIntelEnabled} />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveNotifPrefs}
                  disabled={notifSaving}
                  className="gap-2 bg-teal-700 hover:bg-teal-800"
                >
                  {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {notifSaving ? "Saving..." : "Save Notification Prefs"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
