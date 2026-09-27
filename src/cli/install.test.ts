import { afterEach, describe, expect, mock, test } from 'bun:test';
import { shouldInstallCompanion } from './install';
import type { InstallConfig } from './types';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_STDIN_IS_TTY = process.stdin.isTTY;

const actualConfigManager = require('./config-manager');
const actualBackgroundSubagents = require('./background-subagents');
const actualPaths = require('./paths');

const originalIsOpenCodeInstalled = actualConfigManager.isOpenCodeInstalled;
const originalGetOpenCodeVersion = actualConfigManager.getOpenCodeVersion;
const originalGetOpenCodePath = actualConfigManager.getOpenCodePath;
const originalAddPluginToOpenCodeConfig =
  actualConfigManager.addPluginToOpenCodeConfig;
const originalAddPluginToOpenCodeTuiConfig =
  actualConfigManager.addPluginToOpenCodeTuiConfig;
const originalWarmOpenCodePluginCache =
  actualConfigManager.warmOpenCodePluginCache;
const originalDisableDefaultAgents = actualConfigManager.disableDefaultAgents;
const originalEnableLspByDefault = actualConfigManager.enableLspByDefault;
const originalDetectCurrentConfig = actualConfigManager.detectCurrentConfig;
const originalGenerateLiteConfig = actualConfigManager.generateLiteConfig;
const originalWriteLiteConfig = actualConfigManager.writeLiteConfig;

const originalIsBackgroundSubagentsEnabled =
  actualBackgroundSubagents.isBackgroundSubagentsEnabled;
const originalDetectBackgroundSubagentsTarget =
  actualBackgroundSubagents.detectBackgroundSubagentsTarget;
const originalExpandHomePath = actualBackgroundSubagents.expandHomePath;
const originalGetBackgroundSubagentsBlock =
  actualBackgroundSubagents.getBackgroundSubagentsBlock;
const originalWriteBackgroundSubagentsBlock =
  actualBackgroundSubagents.writeBackgroundSubagentsBlock;
const originalManualBackgroundSubagentsInstructions =
  actualBackgroundSubagents.manualBackgroundSubagentsInstructions;

const originalGetExistingLiteConfigPath = actualPaths.getExistingLiteConfigPath;

const enableInstallMocks = false;
mock.module('./config-manager', () => {
  return {
    ...actualConfigManager,
    isOpenCodeInstalled: async () =>
      enableInstallMocks ? true : originalIsOpenCodeInstalled(),
    getOpenCodeVersion: async () =>
      enableInstallMocks ? '1.0.0' : originalGetOpenCodeVersion(),
    getOpenCodePath: () =>
      enableInstallMocks
        ? '/usr/local/bin/opencode'
        : originalGetOpenCodePath(),
    addPluginToOpenCodeConfig: async () =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalAddPluginToOpenCodeConfig(),
    addPluginToOpenCodeTuiConfig: async () =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalAddPluginToOpenCodeTuiConfig(),
    warmOpenCodePluginCache: async () =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalWarmOpenCodePluginCache(),
    disableDefaultAgents: () =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalDisableDefaultAgents(),
    enableLspByDefault: () =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalEnableLspByDefault(),
    detectCurrentConfig: () =>
      enableInstallMocks
        ? { isInstalled: true }
        : originalDetectCurrentConfig(),
    generateLiteConfig: (cfg: any) =>
      enableInstallMocks ? {} : originalGenerateLiteConfig(cfg),
    writeLiteConfig: (cfg: any, path?: string) =>
      enableInstallMocks
        ? { success: true, configPath: '/path' }
        : originalWriteLiteConfig(cfg, path),
  };
});

mock.module('./background-subagents', () => {
  return {
    ...actualBackgroundSubagents,
    isBackgroundSubagentsEnabled: (env?: string) =>
      enableInstallMocks ? true : originalIsBackgroundSubagentsEnabled(env),
    detectBackgroundSubagentsTarget: (env?: NodeJS.ProcessEnv) =>
      enableInstallMocks
        ? '/path'
        : originalDetectBackgroundSubagentsTarget(env),
    expandHomePath: (p: string) =>
      enableInstallMocks ? p : originalExpandHomePath(p),
    getBackgroundSubagentsBlock: (target: string) =>
      enableInstallMocks ? '' : originalGetBackgroundSubagentsBlock(target),
    writeBackgroundSubagentsBlock: (target: string) =>
      enableInstallMocks ? {} : originalWriteBackgroundSubagentsBlock(target),
    manualBackgroundSubagentsInstructions: (opts?: any) =>
      enableInstallMocks
        ? ''
        : originalManualBackgroundSubagentsInstructions(opts),
  };
});

mock.module('./paths', () => {
  return {
    ...actualPaths,
    getExistingLiteConfigPath: () =>
      enableInstallMocks
        ? '/path/lite-config.json'
        : originalGetExistingLiteConfigPath(),
  };
});

function baseConfig(): InstallConfig {
  return {
    reset: false,
    backgroundSubagents: 'no',
    companion: 'ask',
  };
}

describe('shouldInstallCompanion', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: ORIGINAL_STDIN_IS_TTY,
    });
  });

  test('dry-run defaults to skip on niri', async () => {
    process.env.NIRI_SOCKET = '/run/user/1000/niri.sock';
    const config = { ...baseConfig(), dryRun: true };

    await expect(shouldInstallCompanion(config)).resolves.toBe(false);
    expect(config.companion).toBe('no');
  });

  test('explicit companion yes still enables companion on niri', async () => {
    process.env.XDG_CURRENT_DESKTOP = 'niri';
    const config = { ...baseConfig(), companion: 'yes' as const };

    await expect(shouldInstallCompanion(config)).resolves.toBe(true);
  });

  test('dry-run defaults to skip outside niri', async () => {
    delete process.env.NIRI_SOCKET;
    delete process.env.XDG_CURRENT_DESKTOP;
    delete process.env.DESKTOP_SESSION;
    const config = { ...baseConfig(), dryRun: true };

    await expect(shouldInstallCompanion(config)).resolves.toBe(false);
    expect(config.companion).toBe('no');
  });
});
