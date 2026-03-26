/**
 * 缓存服务接口
 */
export interface ICacheService {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, ttl?: number): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  deleteMany(keys: string[]): Promise<number>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttl: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  clear(): Promise<boolean>;
  getMany<T = any>(keys: string[]): Promise<(T | null)[]>;
  setMany<T = any>(
    items: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<boolean>;
  increment(key: string, amount?: number): Promise<number>;
  decrement(key: string, amount?: number): Promise<number>;
}






































