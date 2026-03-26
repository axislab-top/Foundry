export enum ConfigAdapterType {
  ENV = 'env',
  FILE = 'file',
  CONSUL = 'consul',
}

export enum ConfigPriority {
  ENV = 100,
  FILE = 50,
  REMOTE = 10,
}

export class ConfigManager {
  private static instance: ConfigManager | null = null;

  static async create(): Promise<ConfigManager> {
    const manager = new ConfigManager();
    ConfigManager.instance = manager;
    return manager;
  }

  static getInstance(): ConfigManager | null {
    return ConfigManager.instance;
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue as T;
    }
    return value as unknown as T;
  }
}
