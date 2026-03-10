import { createBrowserRouter } from "react-router-dom";
import NotFoundPage from "../pages/404Page.tsx";
import AuthProtectedRoute from "./AuthProtectedRoute.tsx";
import Providers from "../Providers.tsx";
import { AuthPage } from "@/pages/AuthPage.tsx";
import Onboarding from "@/pages/Onboarding.tsx";
import Dashboard from "@/pages/Dashboard.tsx";
import Proposals from "@/pages/Proposals.tsx";
import ProposalBuilder from "@/pages/ProposalBuilder.tsx";
import ProposalDetail from "@/pages/ProposalDetail.tsx";
import ProposalEdit from "@/pages/ProposalEdit.tsx";
import Projects from "@/pages/Projects.tsx";
import Clients from "@/pages/Clients.tsx";
import Coaching from "@/pages/Coaching.tsx";
import SettingsPage from "@/pages/Settings.tsx";
import ProposalSign from "@/pages/ProposalSign.tsx";
import Opportunities from "@/pages/Opportunities.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Providers />,
    children: [
      // Public routes
      {
        index: true,
        element: <AuthPage />,
      },
      {
        path: "auth",
        element: <AuthPage />,
      },
      {
        path: "onboarding",
        element: <Onboarding />,
      },
      {
        path: "sign/:token",
        element: <ProposalSign />,
      },
      // Protected routes with AppLayout
      {
        path: "/",
        element: <AuthProtectedRoute />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "opportunities", element: <Opportunities /> },
          { path: "proposals", element: <Proposals /> },
          { path: "proposals/new", element: <ProposalBuilder /> },
          { path: "proposals/:id", element: <ProposalDetail /> },
          { path: "proposals/:id/edit", element: <ProposalEdit /> },
          { path: "projects", element: <Projects /> },
          { path: "clients", element: <Clients /> },
          { path: "coaching", element: <Coaching /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default router;
