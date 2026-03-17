import { Calculator } from "lucide-react";

const STARTER_PROMPTS = [
  "Review my scope for missing items",
  "Am I pricing this right for my market?",
  "Help me structure my line items",
  "Should I bid this project or pass?",
];

interface Props {
  onSelect: (prompt: string) => void;
}

export default function StarterPrompts({ onSelect }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mb-4">
        <Calculator className="h-8 w-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">The Estimator</h2>
      <p className="text-sm text-gray-500 mb-8">Scope Review & Pricing Validation</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6">Or ask me anything about estimating and pricing</p>
    </div>
  );
}
