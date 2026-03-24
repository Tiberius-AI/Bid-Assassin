import { useState } from "react";
import { Brain, Handshake, Target, Users } from "lucide-react";
import CoachPage from "@/components/coaching/CoachPage";

const COACHES = [
  {
    id: "estimator",
    name: "The Estimator",
    description: "Reviews your scope, catches missing items, validates pricing against market data.",
    icon: Brain,
    color: "text-blue-600",
    bg: "bg-blue-50",
    available: true,
  },
  {
    id: "closer",
    name: "The Closer",
    description: "Negotiation coaching, objection handling, and strategies to win the bid.",
    icon: Handshake,
    color: "text-green-600",
    bg: "bg-green-50",
    available: true,
  },
  {
    id: "prospector",
    name: "The Prospector",
    description: "Find new opportunities, identify target clients, and build your pipeline.",
    icon: Target,
    color: "text-purple-600",
    bg: "bg-purple-50",
    available: true,
  },
  {
    id: "gc_whisperer",
    name: "The GC Whisperer",
    description: "Master the art of working with general contractors. Relationship building tips.",
    icon: Users,
    color: "text-orange-600",
    bg: "bg-orange-50",
    available: false,
  },
];

export default function Coaching() {
  const [activeCoach, setActiveCoach] = useState<string | null>(null);

  if (activeCoach) {
    return (
      <CoachPage
        coachType={activeCoach}
        onBack={() => setActiveCoach(null)}
      />
    );
  }

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
              onClick={() => coach.available && setActiveCoach(coach.id)}
              disabled={!coach.available}
              className={`bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-left transition-colors relative ${
                coach.available
                  ? "hover:border-gray-300 cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg ${coach.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-6 w-6 ${coach.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{coach.name}</h3>
                    {!coach.available && (
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        Coming Soon
                      </span>
                    )}
                    {coach.available && (
                      <span className="text-[10px] font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Available
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{coach.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
