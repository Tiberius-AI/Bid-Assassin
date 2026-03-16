import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/context/SessionContext";
import supabase from "@/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import {
  Plus,
  Loader2,
  X,
} from "lucide-react";
import type { Project } from "@/types";

const COLUMNS = [
  { key: "identified", label: "Identified", color: "border-gray-300" },
  { key: "reviewing", label: "Reviewing", color: "border-yellow-400" },
  { key: "bid_submitted", label: "Bid Submitted", color: "border-blue-400" },
  { key: "won", label: "Won", color: "border-green-400" },
  { key: "lost", label: "Lost", color: "border-teal-400" },
];

export default function Projects() {
  const { company } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [bidDueDate, setBidDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const fetchProjects = useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProjects((data || []) as Project[]);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!company?.id || !name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          company_id: company.id,
          name,
          client_name: clientName,
          client_company: clientCompany,
          estimated_value: Number(estimatedValue) || 0,
          bid_due_date: bidDueDate || null,
          notes,
        })
        .select()
        .single();
      if (error) throw error;
      setProjects((prev) => [data as Project, ...prev]);
      setShowForm(false);
      setName("");
      setClientName("");
      setClientCompany("");
      setEstimatedValue("");
      setBidDueDate("");
      setNotes("");
      toast.success("Project created");
    } catch {
      toast.error("Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (projectId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ status: newStatus })
        .eq("id", projectId);
      if (error) throw error;
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, status: newStatus as Project["status"] } : p
        )
      );
    } catch {
      toast.error("Failed to update project");
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your bid opportunities from identification to close.
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="gap-2 bg-teal-700 hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" /> Add Project
        </Button>
      </div>

      {/* New Project Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Project Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Downtown Office Repaint" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Client Name</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div>
                  <Label>Client Company</Label>
                  <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Estimated Value ($)</Label>
                  <Input type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} />
                </div>
                <div>
                  <Label>Bid Due Date</Label>
                  <Input type="date" value={bidDueDate} onChange={(e) => setBidDueDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !name.trim()} className="bg-teal-700 hover:bg-teal-800">
                  {saving ? "Saving..." : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4 overflow-x-auto">
          {COLUMNS.map((col) => {
            const colProjects = projects.filter((p) => p.status === col.key);
            return (
              <div key={col.key} className="min-w-[200px]">
                <div className={`border-t-2 ${col.color} rounded-t-lg bg-gray-50 px-3 py-2 mb-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {col.label}
                    </span>
                    <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded">
                      {colProjects.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {colProjects.map((project) => (
                    <div
                      key={project.id}
                      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3"
                    >
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {project.name}
                      </p>
                      {project.client_company && (
                        <p className="text-xs text-gray-500 mb-2">
                          {project.client_company}
                        </p>
                      )}
                      {project.estimated_value > 0 && (
                        <p className="text-xs font-medium text-gray-700">
                          ${project.estimated_value.toLocaleString()}
                        </p>
                      )}
                      {project.bid_due_date && (
                        <p className="text-xs text-gray-400 mt-1">
                          Due: {new Date(project.bid_due_date).toLocaleDateString()}
                        </p>
                      )}
                      {/* Quick status change */}
                      <select
                        value={project.status}
                        onChange={(e) => updateStatus(project.id, e.target.value)}
                        className="mt-2 w-full text-xs border border-gray-200 rounded px-1 py-1"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {colProjects.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-400">
                      No projects
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
