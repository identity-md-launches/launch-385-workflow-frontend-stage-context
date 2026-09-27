import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type Config } from 'wagmi';
import { App } from './App';
import { loadDeployment, type Deployment } from './deployment';
import { createAppConfig } from './wagmi';
import { Button } from './components/ui';

type BootState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; deployment: Deployment; config: Config; queryClient: QueryClient };

/**
 * Loads the runtime deployment configuration, then mounts the app. Nothing renders against the
 * chain until the manifest and ABIs are loaded and verified.
 */
export function Root() {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const deployment = await loadDeployment();
        const config = await createAppConfig(deployment);
        const queryClient = new QueryClient({
          defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
        });
        if (!cancelled) setState({ status: 'ready', deployment, config, queryClient });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <main className="page boot" aria-busy="true">
        <p role="status">Loading the deployment configuration…</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="page boot">
        <h1>Invite referral list</h1>
        <p className="tx-error" role="alert">
          {state.message}
        </p>
        <p className="muted">The page cannot talk to the contracts without a valid deployment configuration.</p>
        <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
          Retry loading
        </Button>
      </main>
    );
  }
  return (
    <WagmiProvider config={state.config}>
      <QueryClientProvider client={state.queryClient}>
        <App deployment={state.deployment} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
