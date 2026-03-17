import { Calculator } from "lucide-react";
import type { CoachMessage } from "@/hooks/useCoachChat";

// Simple markdown renderer: bold, italic, inline code, code blocks, headers, lists
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="bg-gray-100 rounded p-3 my-2 overflow-x-auto text-xs font-mono text-gray-800 whitespace-pre-wrap">
          {codeLines.join("\n")}
        </pre>
      );
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const className = level === 1
        ? "text-base font-bold mt-3 mb-1"
        : level === 2
        ? "text-sm font-bold mt-3 mb-1"
        : "text-sm font-semibold mt-2 mb-1";
      nodes.push(<p key={key++} className={className}>{inlineMarkdown(content)}</p>);
      i++;
      continue;
    }

    // Unordered list item
    if (line.match(/^[-*]\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(
          <li key={key++} className="ml-4">{inlineMarkdown(lines[i].replace(/^[-*]\s+/, ""))}</li>
        );
        i++;
      }
      nodes.push(<ul key={key++} className="list-disc my-2 space-y-0.5">{listItems}</ul>);
      continue;
    }

    // Ordered list item
    if (line.match(/^\d+\.\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        listItems.push(
          <li key={key++} className="ml-4">{inlineMarkdown(lines[i].replace(/^\d+\.\s+/, ""))}</li>
        );
        i++;
      }
      nodes.push(<ol key={key++} className="list-decimal my-2 space-y-0.5">{listItems}</ol>);
      continue;
    }

    // Empty line -> spacing
    if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Normal paragraph
    nodes.push(<p key={key++} className="leading-relaxed">{inlineMarkdown(line)}</p>);
    i++;
  }

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  // Split on bold, italic, and inline code patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

interface Props {
  message: CoachMessage;
}

export default function ChatMessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-red-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
        <Calculator className="h-4 w-4 text-white" />
      </div>
      <div className="max-w-[85%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700">
        {renderMarkdown(message.content)}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
        <Calculator className="h-4 w-4 text-white" />
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
