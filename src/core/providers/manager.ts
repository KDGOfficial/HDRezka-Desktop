import { IProvider } from './types';
import { RezkaProvider } from './rezka/provider';
import { DEFAULT_MIRRORS } from '../../shared/constants';

export class ProviderManager {
  private static instance: ProviderManager;
  private providers: Map<string, IProvider> = new Map();
  private activeProviderId: string = 'hdrezka';

  private constructor() {
    // Register default HDRezka provider
    const defaultRezka = new RezkaProvider('https://hdrezka-home.tv', DEFAULT_MIRRORS);
    this.registerProvider(defaultRezka);
  }

  public static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  public registerProvider(provider: IProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id?: string): IProvider {
    const targetId = id || this.activeProviderId;
    const provider = this.providers.get(targetId);
    if (!provider) {
      throw new Error(`Provider "${targetId}" not found`);
    }
    return provider;
  }

  public setActiveProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider "${id}" is not registered`);
    }
    this.activeProviderId = id;
  }

  public getAllProviders(): Array<{ id: string; name: string; version: string }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
    }));
  }
}
