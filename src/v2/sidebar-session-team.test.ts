import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/solid';
import { projectSidebarTeam, renderSidebar } from '../tui';
import { readTuiSnapshot } from '../tui-state';
import type { SessionPresetState } from './preset-rpc';
import { makeTestEnv } from './test-fixtures';

let env: ReturnType<typeof makeTestEnv>;
beforeEach(() => {
  env = makeTestEnv('omos-sidebar-team');
});
afterEach(() => env.restore());

function state(model = 'saved/team-model'): SessionPresetState {
  return {
    sessionID: 'ses_root',
    status: 'bound',
    presetName: 'same-name',
    affects: 'future-delegations',
    team: {
      agentModels: { oracle: model },
      agentVariants: {},
      inheritance: { explorer: 'session' },
    },
  };
}

describe('window-local sidebar team', () => {
  test('saved team replaces directory defaults without mutating the shared snapshot', () => {
    const snapshot = readTuiSnapshot(env.projectDir);
    snapshot.agentModels = {
      oracle: 'latest/definition',
      explorer: 'latest/explorer',
    };
    snapshot.agentVariants = { oracle: 'latest-variant' };
    const before = structuredClone(snapshot);
    const first = projectSidebarTeam(snapshot, state());
    const second = projectSidebarTeam(
      snapshot,
      state('second/same-name-update'),
    );
    expect(first.agentModels).toEqual({
      oracle: 'saved/team-model',
      explorer: 'Inherits session',
    });
    expect(first.agentVariants).toEqual({});
    expect(second.agentModels.oracle).toBe('second/same-name-update');
    expect(snapshot).toEqual(before);
    expect(readTuiSnapshot(env.projectDir).agentModels).toEqual({});
  });

  test('missing or unavailable binding never uses directory models as saved team', () => {
    const snapshot = readTuiSnapshot(env.projectDir);
    snapshot.agentModels = { oracle: 'latest/definition' };
    expect(projectSidebarTeam(snapshot).agentModels.oracle).toBe('Unknown');
    expect(
      projectSidebarTeam(snapshot, { ...state(), team: undefined }).agentModels
        .oracle,
    ).toBe('Unknown');
  });

  test('current model, future delegation and existing task model have separate labels', async () => {
    const snapshot = readTuiSnapshot(env.projectDir);
    snapshot.agentModels = { oracle: 'latest/definition' };
    snapshot.activeSessions = { ses_task: 'oracle' };
    snapshot.sessionParents = { ses_task: 'ses_root' };
    const saved = state();
    const rendered = await testRender(
      () =>
        renderSidebar(
          projectSidebarTeam(snapshot, saved),
          'test',
          {
            accent: '#777777',
            background: '#111111',
            borderActive: '#555555',
            text: '#eeeeee',
            textMuted: '#aaaaaa',
          },
          false,
          false,
          () => 0,
          'ses_root',
          undefined,
          { name: 'global', sessionLabel: 'same-name' },
          undefined,
          {
            state: saved,
            nativeModel: 'native/main-model',
            taskModel: () => 'actual/task-model',
          },
        ),
      { width: 80, height: 30 },
    );
    try {
      await rendered.renderOnce();
      const frame = rendered.captureCharFrame();
      expect(frame).toContain('Current model: native/main-model');
      expect(frame).toContain('Team · next delegation');
      expect(frame).toContain('team-model');
      expect(frame).toContain('Task: actual/task-model');
      expect(frame).not.toContain('latest/definition');
    } finally {
      rendered.renderer.destroy();
    }
  });
});
