import { useState } from "react";
import { MessageSquare, Brain, Target, Users, Handshake } from "lucide-react";

const COACHES = [
  {
    id: "estimator",
    name: "The Estimator",
    description: "Reviews your scope, catches missing items, validates pricing against market data.",
    icon: Brain,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "closer",
    name: "The Closer",
    description: "Negotiation coaching, objection handling, and strategies to win the bid.",
    icon: Handshake,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    id: "prospector",
    name: "The Prospector",
    description: "Find new opportunities, identify target clients, and build your pipeline.",
    icon: Target,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    id: "gc_whisperer",
    name: "The GC Whisperer",
    description: "Master the art of working with general contractors. Relationship building tips.",
    icon: Users,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
];

export default function Coaching() {
  const [, setSelectedCoach] = useState<string | null>(null);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">AI Coaches</h1>
        <p className="text-sm text-gray-500 mt-1">
          Specialized AI assistants to help you at every stage of the bid lifecycle.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COACHES.map((coach) => {
          const Icon = coach.icon;
          return (
            <button
              key={coach.id}
              onClick={() => setSelectedCoach(coach.id)}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-left hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg ${coach.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-6 w-6 ${coach.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{coach.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{coach.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Coming Soon Notice */}
      <div className="mt-8 bg-gray-50 rounded-lg border border-gray-200 p-6 text-center">
        <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          AI Coaching Coming Soon
        </h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Full coaching chat sessions with context-aware AI assistants are in Phase 4.
          For now, use the AI Agent in the Proposal Builder for intelligent proposal assistance.
        </p>
      </div>
    </div>
  );
}
