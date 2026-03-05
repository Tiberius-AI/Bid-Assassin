import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import supabase from "@/supabase";
import { useSession } from "@/context/SessionContext";
import { Crosshair } from "lucide-react";

export function AuthPage() {
  const { session, profile } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Logged in successfully!");
    } catch (e) {
      const error = e as Error;
      toast.error(error.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) throw error;
      toast.success("Account created! Check your email for verification.");
    } catch (e) {
      const error = e as Error;
      toast.error(error.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && profile) {
      if (profile.onboarding_completed) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    }
  }, [session, profile, navigate]);

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10 bg-white">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md p-8 pb-18 pt-12 rounded-lg border border-gray-200 shadow-sm">
            <Tabs defaultValue="login" className="w-full">
              <div className="flex flex-col items-center gap-2 mb-6 text-center">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-8 w-8 text-red-600" />
                  <h1 className="text-2xl font-bold text-gray-900">Bid Assassin</h1>
                </div>
                <p className="text-gray-500 text-sm">
                  AI-powered proposals for commercial subcontractors
                </p>
              </div>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="flex flex-col gap-4 mt-4" onSubmit={handleLogin}>
                  <div className="grid gap-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={loading}>
                    {loading ? "Signing In..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form className="flex flex-col gap-4 mt-4" onSubmit={handleRegister}>
                  <div className="grid gap-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="John Smith"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={loading}>
                    {loading ? "Creating Account..." : "Create Account"}
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    14-day free trial. No credit card required.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      <div className="relative hidden lg:flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-8 text-center">
          <Crosshair className="h-16 w-16 text-red-600 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Win More Bids. Faster.
          </h2>
          <p className="text-gray-600 text-lg">
            AI-powered proposal generation for commercial subcontractors. Walk the site, enter your notes, get a polished PDF proposal in minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
