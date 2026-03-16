import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { useProposal } from "@/hooks/useProposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/supabase";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import type { LineItem, AISuggestions } from "@/types";

function newLineItem(): LineItem {
  return { description: "", quantity: 1, unit: "ea", unit_price: 0, total_price: 0 };
}

export default function ProposalEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useSession();
  const { proposal, loading, error, updateProposal } = useProposal(id);

  const [initialised, setInitialised] = useState(false);
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");

  // Rich fields
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [timeline, setTimeline] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // About Us & T&C
  const [aboutUs, setAboutUs] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");

  // Media
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [clientLogoUploading, setClientLogoUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosUploading, setPhotosUploading] = useState(false);

  const clientLogoRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Seed state once on first load
  if (proposal && !initialised) {
    const ai = proposal.ai_suggestions as AISuggestions;
    setClientName(proposal.client_name || "");
    setClientEmail(proposal.client_email || "");
    setClientCompany(proposal.client_company || "");
    setProjectName(proposal.project_name || "");
    setProjectAddress(proposal.project_address || "");
    setScopeOfWork(proposal.scope_of_work || "");
    setInclusions(proposal.inclusions || "");
    setExclusions(proposal.exclusions || "");
    setTimeline(proposal.timeline_description || "");
    setPaymentTerms(proposal.payment_terms || "");
    setWarrantyTerms(proposal.warranty_terms || "");
    setLineItems(ai?.line_items?.length ? [...ai.line_items] : [newLineItem()]);
    setClientLogoUrl(proposal.client_logo_url || null);
    setPhotos(proposal.project_photos || []);
    setAboutUs(proposal.about_us ?? company?.company_bio ?? "");
    setTermsAndConditions(proposal.terms_and_conditions ?? company?.default_terms ?? "");

    const defaultExpiry = proposal.expires_at
      ? new Date(proposal.expires_at)
      : new Date(new Date(proposal.created_at).getTime() + 30 * 24 * 60 * 60 * 1000);
    setExpiresAt(defaultExpiry.toISOString().slice(0, 10));

    setInitialised(true);
  }

  // --- Client logo upload ---
  const handleClientLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !proposal) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Only PNG and JPG files are allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    setClientLogoUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${proposal.id}/client-logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("proposal-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("proposal-assets").getPublicUrl(path);
      setClientLogoUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch {
      toast.error("Failed to upload client logo");
    } finally {
      setClientLogoUploading(false);
      if (clientLogoRef.current) clientLogoRef.current.value = "";
    }
  };

  // --- Project photos upload ---
  const handlePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !proposal) return;

    const validFiles = files.filter((f) => ["image/png", "image/jpeg"].includes(f.type));
    if (validFiles.length !== files.length) toast.error("Only PNG/JPG files are accepted");
    if (!validFiles.length) return;

    setPhotosUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of validFiles) {
        const ext = file.type === "image/png" ? "png" : "jpg";
        const path = `${proposal.id}/photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("proposal-assets")
          .upload(path, file, { contentType: file.type });
        if (upErr) { toast.error(`Failed to upload ${file.name}`); continue; }
        const { data } = supabase.storage.from("proposal-assets").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
      if (uploaded.length) toast.success(`${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} uploaded`);
    } finally {
      setPhotosUploading(false);
      if (photosRef.current) photosRef.current.value = "";
    }
  };

  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((p) => p !== url));

  // --- Line item helpers ---
  const updateLineItem = (index: number, field: keyof LineItem, raw: string | number) => {
    setLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === "description" || field === "unit") {
        (item as Record<string, unknown>)[field] = raw;
      } else {
        const num = parseFloat(String(raw)) || 0;
        (item as Record<string, unknown>)[field] = num;
        if (field === "quantity" || field === "unit_price") {
          item.total_price =
            (field === "quantity" ? num : item.quantity) *
            (field === "unit_price" ? num : item.unit_price);
        }
      }
      next[index] = item;
      return next;
    });
  };

  const addLineItem = () => setLineItems((prev) => [...prev, newLineItem()]);
  const removeLineItem = (index: number) => setLineItems((prev) => prev.filter((_, i) => i !== index));
  const total = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

  // --- Save ---
  const handleSave = async () => {
    if (!proposal) return;
    setSaving(true);
    try {
      const existingAI = (proposal.ai_suggestions as AISuggestions) || {};
      await updateProposal({
        client_name: clientName,
        client_email: clientEmail,
        client_company: clientCompany,
        project_name: projectName,
        project_address: projectAddress,
        scope_of_work: scopeOfWork,
        inclusions,
        exclusions,
        timeline_description: timeline,
        payment_terms: paymentTerms,
        warranty_terms: warrantyTerms,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        client_logo_url: clientLogoUrl,
        project_photos: photos,
        about_us: aboutUs,
        terms_and_conditions: termsAndConditions,
        total_amount: total,
        ai_suggestions: { ...existingAI, line_items: lineItems },
      });
      toast.success("Proposal saved");
      navigate(`/proposals/${proposal.id}`);
    } catch {
      toast.error("Failed to save proposal");
    } finally {
      setSaving(false);
    }
  };

  // --- Loading / error states ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error || !proposal) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-10 w-10 text-teal-500 mx-auto mb-3" />
        <p className="text-gray-500">{error || "Proposal not found"}</p>
        <Button variant="outline" onClick={() => navigate("/proposals")} className="mt-4">
          Back to Proposals
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="outline"
          onClick={() => navigate(`/proposals/${proposal.id}`)}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{proposal.proposal_number}</span>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-teal-700 hover:bg-teal-800">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Client & Project */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Client & Project</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Client Name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <Label>Client Email</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <Label>Client Company</Label>
              <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
            </div>
            <div>
              <Label>Project Name</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Project Address</Label>
              <Input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} />
            </div>
          </div>

          {/* Client Logo */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <Label className="mb-2 block">Client Logo <span className="text-gray-400 font-normal">(optional)</span></Label>
            <div className="flex items-center gap-4">
              {clientLogoUrl ? (
                <div className="relative">
                  <img
                    src={clientLogoUrl}
                    alt="Client logo"
                    className="h-14 w-auto max-w-[140px] object-contain rounded border border-gray-200 bg-gray-50 p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setClientLogoUrl(null)}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-teal-700 text-white flex items-center justify-center hover:bg-teal-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-14 w-28 rounded border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">
                  No logo
                </div>
              )}
              <div>
                <input
                  ref={clientLogoRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleClientLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={clientLogoUploading}
                  onClick={() => clientLogoRef.current?.click()}
                  className="gap-2"
                >
                  {clientLogoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {clientLogoUploading ? "Uploading..." : "Upload Logo"}
                </Button>
                <p className="text-xs text-gray-400 mt-1">PNG or JPG, max 2MB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scope of Work */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Scope of Work</h2>
          <Textarea
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            rows={6}
            className="resize-y"
          />
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left pb-2 font-medium text-gray-500 pr-2">Description</th>
                  <th className="text-right pb-2 font-medium text-gray-500 w-16 px-2">Qty</th>
                  <th className="text-center pb-2 font-medium text-gray-500 w-20 px-2">Unit</th>
                  <th className="text-right pb-2 font-medium text-gray-500 w-28 px-2">Unit Price</th>
                  <th className="text-right pb-2 font-medium text-gray-500 w-28 px-2">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-2">
                      <Input
                        value={item.description}
                        onChange={(e) => updateLineItem(i, "description", e.target.value)}
                        placeholder="Description"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                        className="h-8 text-sm text-right w-16"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        value={item.unit}
                        onChange={(e) => updateLineItem(i, "unit", e.target.value)}
                        placeholder="ea"
                        className="h-8 text-sm text-center w-20"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
                          className="h-8 text-sm text-right pl-5 w-28"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900 w-28">
                      ${(item.total_price || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pl-1">
                      <button
                        type="button"
                        onClick={() => removeLineItem(i)}
                        disabled={lineItems.length === 1}
                        className="text-gray-400 hover:text-teal-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right font-semibold text-gray-900 pr-2">Total</td>
                  <td className="pt-3 text-right font-bold text-lg text-gray-900 px-2">
                    ${total.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> Add Line Item
          </Button>
        </div>

        {/* Inclusions & Exclusions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Inclusions & Exclusions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Inclusions <span className="text-gray-400 font-normal">(one per line)</span></Label>
              <Textarea
                value={inclusions}
                onChange={(e) => setInclusions(e.target.value)}
                rows={5}
                placeholder="Each inclusion on its own line"
                className="resize-y mt-1"
              />
            </div>
            <div>
              <Label>Exclusions <span className="text-gray-400 font-normal">(one per line)</span></Label>
              <Textarea
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                rows={5}
                placeholder="Each exclusion on its own line"
                className="resize-y mt-1"
              />
            </div>
          </div>
        </div>

        {/* Project Photos */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Project Photos</h2>
          <p className="text-sm text-gray-500 mb-4">Before/after shots, reference work, or site photos. These will appear in the proposal and PDF.</p>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              {photos.map((url) => (
                <div key={url} className="relative group aspect-square">
                  <img
                    src={url}
                    alt="Project photo"
                    className="w-full h-full object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-teal-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-teal-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <input
              ref={photosRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={handlePhotosUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photosUploading}
              onClick={() => photosRef.current?.click()}
              className="gap-2"
            >
              {photosUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {photosUploading ? "Uploading..." : "Add Photos"}
            </Button>
            <span className="text-xs text-gray-400 ml-3">PNG or JPG, multiple files allowed</span>
          </div>
        </div>

        {/* About Us */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">About Us</h2>
          <p className="text-sm text-gray-500 mb-4">Pre-filled from your company settings — edit for this proposal if needed.</p>
          <Textarea
            value={aboutUs}
            onChange={(e) => setAboutUs(e.target.value)}
            rows={5}
            placeholder="Describe your company, experience, licenses, and certifications..."
            className="resize-y"
          />
        </div>

        {/* Terms & Conditions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Terms & Conditions</h2>
          <p className="text-sm text-gray-500 mb-4">Pre-filled from your default T&C — edit for this proposal if needed.</p>
          <Textarea
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            rows={8}
            placeholder="Enter terms and conditions..."
            className="resize-y"
          />
        </div>

        {/* Terms */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Terms & Timeline</h2>
          <div className="space-y-4">
            <div>
              <Label>Proposal Valid Until</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-48"
              />
            </div>
            <div>
              <Label>Timeline</Label>
              <Input value={timeline} onChange={(e) => setTimeline(e.target.value)} />
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>
            <div>
              <Label>Warranty Terms</Label>
              <Textarea
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
                rows={3}
                className="resize-y"
              />
            </div>
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex justify-end pb-4">
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-teal-700 hover:bg-teal-800">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
