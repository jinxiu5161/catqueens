import { sys } from 'cc';
import type { StorageAdapter } from './StorageAdapter';

/** Uses Cocos `sys.localStorage` (works on native + web builds). */
export class CocosStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    return sys.localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    sys.localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    sys.localStorage.removeItem(key);
  }
}
