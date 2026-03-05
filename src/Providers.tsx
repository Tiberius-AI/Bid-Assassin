import { Outlet } from "react-router-dom";
import { SessionProvider } from "./context/SessionContext";
import { Toaster } from "react-hot-toast";

const Providers = () => {
  return (
    <SessionProvider>
      <Outlet />
      <Toaster position="top-right" />
    </SessionProvider>
  );
};

export default Providers;
