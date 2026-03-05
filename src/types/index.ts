export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  profile_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  trades: string[];
  certifications: string[];
  license_number: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  default_payment_terms: string;
  default_warranty_terms: string;
  proposal_tone: "professional" | "friendly" | "aggressive";
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

export interface AISuggestions {
  line_items: LineItem[];
  scope_of_work: string;
  exclusions: string[];
  inclusions: string[];
  timeline: string;
  total_amount: number;
  pricing_confidence: "low" | "medium" | "high";
  market_range: { low: number; high: number };
  suggestions: string[];
}

export interface ClientResearch {
  company_overview: string;
  google_business: {
    rating: number;
    review_count: number;
    review_themes: string[];
    categories: string[];
  } | null;
  website_summary: string;
  social_media: {
    linkedin: string;
    other: string;
  } | null;
  tailoring_insights: string[];
}

export interface Proposal {
  id: string;
  company_id: string;
  proposal_number: string;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  project_name: string | null;
  project_address: string | null;
  scope_of_work: string | null;
  exclusions: string | null;
  inclusions: string | null;
  timeline_description: string | null;
  total_amount: number;
  payment_terms: string | null;
  warranty_terms: string | null;
  status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
  build_mode: "manual" | "agent";
  ai_suggestions: AISuggestions | Record<string, never>;
  client_research: ClientResearch | Record<string, never>;
  agent_conversation: ChatMessage[];
  intake_answers: Record<string, string>;
  pdf_url: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  client_name: string | null;
  client_company: string | null;
  status: "identified" | "reviewing" | "bid_submitted" | "won" | "lost";
  estimated_value: number;
  bid_due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  type: "gc" | "property_manager" | "owner" | "other";
  relationship_status: "cold" | "warm" | "active" | "preferred";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: string;
  company_id: string;
  proposal_id: string | null;
  due_date: string | null;
  type: "email" | "phone" | "text";
  status: "pending" | "completed" | "skipped";
  ai_suggested_message: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface CoachingSession {
  id: string;
  company_id: string;
  coach_type: "estimator" | "closer" | "prospector" | "gc_whisperer";
  messages: ChatMessage[];
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
