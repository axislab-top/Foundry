import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { startAccessTokenRefreshScheduler } from "@/shared/auth/accessTokenLifecycle";

type AppProvidersProps = {
  children: ReactNode;
};

export default function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => startAccessTokenRefreshScheduler(), []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
