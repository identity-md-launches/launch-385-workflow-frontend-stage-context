import { createConfig, fallback, http, type Config, type CreateConnectorFn } from 'wagmi';
import { injected } from 'wagmi/connectors';
import type { Connector } from 'wagmi';
import { WALLETCONNECT_PROJECT_ID } from './config';
import type { Deployment } from './deployment';

/**
 * Build the wagmi config from the runtime deployment. Reads go through the public RPC URLs from
 * the network block (in order, with fallback); signing stays with the visitor's wallet.
 */
export async function createAppConfig(deployment: Deployment): Promise<Config> {
  const { chain } = deployment;
  const connectors: CreateConnectorFn[] = [injected()];
  if (WALLETCONNECT_PROJECT_ID) {
    // Only bundled when a project ID is baked in at build time.
    const { walletConnect } = await import('wagmi/connectors');
    connectors.push(walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true }));
  }
  return createConfig({
    chains: [chain],
    connectors,
    multiInjectedProviderDiscovery: true,
    transports: {
      [chain.id]: fallback(chain.rpcUrls.default.http.map((url) => http(url, { batch: true, retryCount: 2 }))),
    },
  });
}

/** Human label for a connector, de-duplicating the generic injected entry. */
export function connectorLabel(connector: Connector): string {
  return connector.name === 'Injected' ? 'Browser wallet' : connector.name;
}
