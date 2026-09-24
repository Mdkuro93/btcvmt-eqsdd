import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes (0ms latency for visited pages)
      gcTime: 15 * 60 * 1000,   // 15 minutes cache time
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
