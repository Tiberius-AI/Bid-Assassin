import { Radar } from "lucide-react";

export default function Opportunities() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="bg-red-50 rounded-full p-5 mb-6">
        <Radar className="w-10 h-10 text-red-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        The Prospector — Coming Soon
      </h1>
      <p className="text-gray-500 max-w-md">
        We're finalizing our federal contract data feed. Once live, this page
        will automatically surface SAM.gov opportunities matched to your trade
        profile — scored and ranked for you.
      </p>
      <p className="text-sm text-gray-400 mt-4">Check back soon.</p>
    </div>
  );
}
