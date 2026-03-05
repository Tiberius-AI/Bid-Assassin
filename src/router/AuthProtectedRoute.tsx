import { Navigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import AppLayout from "@/components/layout/AppLayout";

const AuthProtectedRoute = () => {
  const { session, profile } = useSession();

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <AppLayout />;
};

export default AuthProtectedRoute;
