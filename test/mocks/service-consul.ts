export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  tags?: string[];
  meta?: Record<string, string>;
}

export class ConsulManager {
  getClient() {
    return {};
  }
}

export class ServiceDiscovery {
  constructor(..._args: any[]) {}

  async discoverHealthy(): Promise<ServiceInstance[]> {
    return [];
  }

  watch(): () => void {
    return () => {};
  }
}

export class ServiceWatcher {
  constructor(..._args: any[]) {}

  watch(): () => void {
    return () => {};
  }
}
