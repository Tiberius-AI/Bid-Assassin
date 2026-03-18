import { Calculator, Target } from "lucide-react";

const COACH_CONFIG: Record<string, {
  icon: React.ElementType;
  iconBg: string;
  name: string;
  subtitle: string;
  prompts: string[];
}> = {
  estimator: {
    icon: Calculator,
    iconBg: "bg-blue-500",
    name: "The Estimator",
    subtitle: "Scope Review & Pricing Validation",
    prompts: [
      "Review my scope for missing items",
      "Am I pricing this right for my market?",
      "Help me structure my line items",
      "Should I bid this project or pass?",
    ],
  },
  prospector: {
    icon: Target,
    iconBg: "bg-purple-500",
    name: "The Prospector",
    subtitle: "Opportunity Hunting & Pipeline Building",
    prompts: [
      "Where should I look for work this week?",
      "Help me evaluate this opportunity",
      "How do I get on a GC's bid list?",
      "Build me a weekly prospecting routine",
    ],
  },
};

interface Props {
  coachType: string;
  onSelect: (prompt: string) => void;
}

export default function StarterPrompts({ coachType, onSelect }: Props) {
  const config = COACH_CONFIG[coachType] ?? COACH_CONFIG.estimator;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <div className={`w-16 h-16 rounded-full ${config.iconBg} flex items-center justify-center mb-4`}>
        <Icon className="h-8 w-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{config.name}</h2>
      <p className="text-sm text-gray-500 mb-8">{config.subtitle}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {config.prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6">Or ask me anything</p>
    </div>
  );
}
