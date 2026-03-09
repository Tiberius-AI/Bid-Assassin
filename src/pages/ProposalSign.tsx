import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import supabase from "@/supabase";
import SignaturePad from "@/components/proposals/SignaturePad";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/types";

export default function ProposalSign() {
  const { token } = useParams<{ token: string }>();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) return;
    async function load() {
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("signature_token", token)
        .maybeSingle();

      if (error || !data) {
        setError("This signing link is invalid or has expired.");
      } else {
        setProposal(data as Proposal);
        if (data.client_signature) setSigned(true);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  const handleSign = async () => {
    if (!signature || !proposal) return;
    setSigning(true);
    try {
      const { error } = await supabase
        .from("proposals")
        .update({
          client_signature: signature,
          client_signed_at: new Date().toISOString(),
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("signature_token", token);

      if (error) throw error;
      setSigned(true);
    } catch {
      setError("Failed to save your signature. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Link Not Found</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const aiSuggestions = proposal.ai_suggestions as { line_items?: Array<{ description: string; quantity: number; unit: string; unit_price: number; total_price: number }>; pricing_mode?: string } | null;
  const lineItems = aiSuggestions?.line_items || [];
  const isMonthly = aiSuggestions?.pricing_mode === "monthly";

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center max-w-md">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Proposal Accepted!</h2>
          <p className="text-gray-500 text-sm">
            Thank you for signing. Your contractor has been notified and will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Proposal</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {proposal.project_name || `${proposal.client_company || proposal.client_name} Proposal`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {proposal.proposal_number} &middot; {proposal.project_address}
          </p>
        </div>

        {/* Scope Summary */}
        {proposal.scope_of_work && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Scope of Work</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.scope_of_work}</p>
          </div>
        )}

        {/* Line Items */}
        {lineItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Mobile: card-per-item */}
            <div className="sm:hidden divide-y divide-gray-100">
              {lineItems.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.quantity} {item.unit} &middot; ${item.unit_price.toLocaleString()} each
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 shrink-0">
                    ${item.total_price.toLocaleString()}
                  </p>
                </div>
              ))}
              <div className="bg-gray-50 border-t-2 border-gray-200 px-4 py-3 space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-900">
                    {isMonthly ? "Monthly Total" : "Total"}
                  </span>
                  <span className="text-base font-bold text-gray-900">
                    ${proposal.total_amount.toLocaleString()}{isMonthly ? "/mo" : ""}
                  </span>
                </div>
                {isMonthly && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-gray-500">Annual Contract Value</span>
                    <span className="text-xs text-gray-500">${(proposal.total_amount * 12).toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop: full table */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Unit Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-800">{item.description}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${item.unit_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">${item.total_price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 font-semibold text-right text-gray-900">
                    {isMonthly ? "Monthly Total" : "Total"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    ${proposal.total_amount.toLocaleString()}{isMonthly ? "/mo" : ""}
                  </td>
                </tr>
                {isMonthly && (
                  <tr className="bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500">
                      Annual Contract Value
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500">
                      ${(proposal.total_amount * 12).toLocaleString()}/yr
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}

        {/* Contractor Signature */}
        {proposal.contractor_signature && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Contractor Signature</h2>
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 inline-block">
              <img
                src={proposal.contractor_signature}
                alt="Contractor signature"
                className="max-h-[100px] object-contain"
              />
            </div>
            {proposal.contractor_signed_at && (
              <p className="text-xs text-gray-400 mt-1">
                Signed {new Date(proposal.contractor_signed_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Client Signature */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Your Signature</h2>
          <p className="text-xs text-gray-500 mb-4">
            By signing below you agree to the scope, pricing, and terms outlined in this proposal.
          </p>
          <SignaturePad
            onSign={(dataUrl) => setSignature(dataUrl)}
            onClear={() => setSignature(null)}
            className="w-full"
          />
          {error && (
            <p className="text-xs text-red-500 mt-2">{error}</p>
          )}
          <Button
            className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white"
            disabled={!signature || signing}
            onClick={handleSign}
          >
            {signing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
            ) : (
              "Sign & Accept Proposal"
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400 pb-6">
          Powered by Bid Assassin &middot; Tiberius AI LLC
        </p>
      </div>
    </div>
  );
}
