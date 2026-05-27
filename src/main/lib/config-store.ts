import Store from 'electron-store'
import type { AppConfig } from '../../shared/types'
import { DEFAULT_CONFIG as DEFAULT } from '../../shared/types'

const store = new Store<{ config: AppConfig }>({
  name: 'finansownik-config',
  defaults: { config: DEFAULT }
})

export function getConfig(): AppConfig {
  return store.get('config', DEFAULT)
}

export function saveConfig(config: AppConfig): void {
  store.set('config', config)
}

export function getConfigPath(): string {
  return store.path
}
