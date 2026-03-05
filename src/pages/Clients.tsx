import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/context/SessionContext";
import supabase from "@/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import { Plus, Users, Loader2, X, Trash2 } from "lucide-react";
import type { Client } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  gc: "General Contractor",
  property_manager: "Property Manager",
  owner: "Owner",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  cold: "bg-gray-100 text-gray-600",
  warm: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  preferred: "bg-blue-100 text-blue-700",
};

export default function Clients() {
  const { company } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("gc");
  const [notes, setNotes] = useState("");

  const fetchClients = useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setClients((data || []) as Client[]);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleCreate = async () => {
    if (!company?.id || !name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          company_id: company.id,
          name,
          company_name: companyName,
          email,
          phone,
          type,
          notes,
        })
        .select()
        .single();
      if (error) throw error;
      setClients((prev) => [data as Client, ...prev]);
      setShowForm(false);
      resetForm();
      toast.success("Client added");
    } catch {
      toast.error("Failed to add client");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client?")) return;
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      setClients((prev) => prev.filter((c) => c.id !== id));
      toast.success("Client deleted");
    } catch {
      toast.error("Failed to delete client");
    }
  };

  const resetForm = () => {
    setName("");
    setCompanyName("");
    setEmail("");
    setPhone("");
    setType("gc");
    setNotes("");
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your GCs, property managers, and owners.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-red-600 hover:bg-red-700">
          <Plus className="h-4 w-4" /> Add Client
        </Button>
      </div>

      {/* Add Client Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Client</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Contact Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <Label>Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ABC Property Mgmt" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !name.trim()} className="bg-red-600 hover:bg-red-700">
                  {saving ? "Saving..." : "Add Client"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
          <p className="text-sm text-gray-500 mb-4">Add your first client to start tracking relationships.</p>
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4" /> Add Client
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div key={client.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{client.name}</p>
                  {client.company_name && (
                    <p className="text-xs text-gray-500">{client.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[client.relationship_status]}`}>
                    {client.relationship_status}
                  </span>
                  <button onClick={() => handleDelete(client.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {client.email && <p className="text-xs text-gray-600">{client.email}</p>}
                {client.phone && <p className="text-xs text-gray-600">{client.phone}</p>}
                <p className="text-xs text-gray-400">{TYPE_LABELS[client.type]}</p>
              </div>
              {client.notes && (
                <p className="mt-2 text-xs text-gray-500 line-clamp-2">{client.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
