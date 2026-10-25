import { describe, expect, test } from 'bun:test';
import {
  createSessionPresets,
  type SessionTeamBundle,
} from './session-presets';

const bundle = (name: string): SessionTeamBundle => ({
  presetName: name,
  fallbackEnabled: true,
  profiles: {
    explorer: {
      model: { providerID: 'test', id: name },
      temperature: name === 'A' ? 0.1 : 0.8,
      providerOptions: { reasoning: name },
      sidebarModel: `test/${name}`,
    },
  },
  chains: { explorer: [{ id: `test/${name}` }, { id: `backup/${name}` }] },
  inheritance: {},
});

function storageFixture() {
  const values = new Map<string, any>();
  let writes = 0;
  return {
    values,
    writes: () => writes,
    storage: {
      get: async (key: string) => structuredClone(values.get(key)),
      set: async (key: string, value: unknown) => {
        writes++;
        values.set(key, structuredClone(value));
      },
      remove: async (key: string) => {
        values.delete(key);
      },
    },
  };
}

describe('bound creation context scope', () => {
  function fixture() {
    const f = storageFixture();
    const sessions = new Map<string, any>();
    const creates: any[] = [];
    let offline = false;
    const service = (workspaceID?: string, known = true) =>
      createSessionPresets({
        storage: f.storage,
        directory: '/project',
        ...(known
          ? {
              location: {
                directory: '/project',
                ...(workspaceID ? { workspaceID } : {}),
              },
            }
          : {}),
        current: () => bundle('A'),
        named: async (name) => bundle(name),
        agents: async () => [{ id: 'lead', mode: 'primary' }],
        session: {
          get: async ({ sessionID }: { sessionID: string }) => {
            const info = sessions.get(sessionID);
            if (!info) throw { _tag: 'Session.NotFoundError' };
            // PublicRef deliberately does not expose workspaceID.
            return {
              id: info.id,
              agent: info.agent,
              model: info.model,
              location: { directory: '/project' },
            };
          },
          create: async (input: any) => {
            if (offline) throw new Error('host unavailable');
            expect(input).not.toHaveProperty('location');
            creates.push(input);
            sessions.set(input.id, {
              ...input,
              workspaceID: workspaceID ?? null,
            });
          },
        } as never,
      });
    return {
      ...f,
      service,
      sessions,
      creates,
      offline: (value: boolean) => {
        offline = value;
      },
    };
  }
  const input = {
    sessionID: 'root',
    operationID: 'create-op',
    presetName: 'A',
    agent: 'lead',
    model: { providerID: 'test', id: 'selected' },
  };

  test.each([undefined, 'workspace-A'])(
    'new creation freezes explicit local/workspace scope: %s',
    async (workspaceID) => {
      const f = fixture();
      const service = f.service(workspaceID);
      try {
        await service.createBound(input);
        expect(f.sessions.get('root').workspaceID).toBe(workspaceID ?? null);
        expect(f.values.get('session-preset/v1/root').createdBy.scope).toEqual({
          directory: '/project',
          workspaceID: workspaceID ?? null,
        });
        expect(f.creates).toHaveLength(1);
      } finally {
        await service.dispose();
      }
    },
  );

  test('same-directory cross-context retries and completed fast paths reject; matching context recovers frozen creation', async () => {
    const f = fixture();
    const a = f.service('workspace-A');
    const b = f.service('workspace-B');
    const local = f.service();
    try {
      f.offline(true);
      await expect(a.createBound(input)).rejects.toThrow('host unavailable');
      const before = structuredClone([...f.values]);
      f.offline(false);
      for (const foreign of [b, local]) {
        await expect(foreign.retry('root', 'create-op')).rejects.toThrow(
          'scope mismatch',
        );
        await expect(foreign.createBound(input)).rejects.toThrow(
          'scope mismatch',
        );
        expect([...f.values]).toEqual(before);
        expect(f.creates).toHaveLength(0);
      }
      await a.retry('root', 'create-op');
      expect(f.sessions.get('root').workspaceID).toBe('workspace-A');
      await a.apply('root', 'B');
      expect((await a.createBound(input)).presetName).toBe('B');
      expect((await a.retry('root', 'create-op')).presetName).toBe('B');
      for (const foreign of [b, local]) {
        await expect(foreign.retry('root', 'create-op')).rejects.toThrow(
          'scope mismatch',
        );
        await expect(foreign.createBound(input)).rejects.toThrow(
          'scope mismatch',
        );
      }
      expect(f.creates).toHaveLength(1);
    } finally {
      await Promise.all([a.dispose(), b.dispose(), local.dispose()]);
    }
  });

  test('unknown old creation scope is never filled by retry; ordinary old binding reads and Apply survive', async () => {
    const f = fixture();
    const service = f.service('workspace-A');
    try {
      f.offline(true);
      await expect(service.createBound(input)).rejects.toThrow(
        'host unavailable',
      );
      const record = f.values.get('session-preset/v1/root');
      delete record.pending.input.scope;
      const before = structuredClone([...f.values]);
      f.offline(false);
      await expect(service.retry('root', 'create-op')).rejects.toThrow(
        'scope unknown',
      );
      await expect(service.createBound(input)).rejects.toThrow('scope unknown');
      expect([...f.values]).toEqual(before);
      expect(f.creates).toHaveLength(0);
      f.sessions.set('root', { id: 'root', agent: 'lead', model: input.model });
      f.values.set('session-preset/v1/root', {
        schemaVersion: 2,
        revision: 0,
        bundle: bundle('A'),
        createdBy: record.pending.input,
        completedOperationID: 'create-op',
      });
      expect((await service.readState('root')).status).toBe('bound');
      expect((await service.ensure('root'))?.bundle.presetName).toBe('A');
      expect((await service.apply('root', 'B')).presetName).toBe('B');
      await expect(service.retry('root', 'create-op')).rejects.toThrow(
        'scope unknown',
      );
      await expect(service.createBound(input)).rejects.toThrow('scope unknown');
    } finally {
      await service.dispose();
    }
  });

  test('missing authoritative ctx.location cannot authorize even a local creation', async () => {
    const f = fixture();
    const service = f.service(undefined, false);
    try {
      await expect(service.createBound(input)).rejects.toThrow(
        'scope unavailable',
      );
      expect(f.values.size).toBe(0);
      expect(f.creates).toHaveLength(0);
    } finally {
      await service.dispose();
    }
  });

  test('boundary: public get cannot detect a later same-directory workspace move', async () => {
    const f = fixture();
    const a = f.service('workspace-A');
    try {
      await a.createBound(input);
      f.sessions.get('root').workspaceID = 'workspace-B';
      // The credential authenticates the original creation context, not the
      // session's present workspace (which public get intentionally hides).
      expect((await a.retry('root', 'create-op')).status).toBe('bound');
      expect(f.creates).toHaveLength(1);
    } finally {
      await a.dispose();
    }
  });
});
