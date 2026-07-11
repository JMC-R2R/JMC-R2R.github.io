import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthController } from './app.mjs';


test('initialization shows sign-in when no session exists', async () => {
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  };
  const view = {
    showLoading: () => calls.push('loading'),
    showSignIn: () => calls.push('sign-in'),
  };

  const controller = createAuthController({ client, view });
  await controller.initialize();

  assert.deepEqual(calls, ['loading', 'sign-in']);
});

test('magic-link request uses the supplied email and current route', async () => {
  const requests = [];
  const client = {
    auth: {
      signInWithOtp: async (request) => {
        requests.push(request);
        return { error: null };
      },
    },
  };
  const notices = [];
  const view = {
    showNotice: (message) => notices.push(message),
  };
  const controller = createAuthController({
    client,
    view,
    redirectUrl: 'https://readytorank.com.au/gluten-free-world/content-operations/',
  });

  await controller.requestMagicLink('jose@readytorank.com.au');

  assert.deepEqual(requests, [{
    email: 'jose@readytorank.com.au',
    options: {
      emailRedirectTo: 'https://readytorank.com.au/gluten-free-world/content-operations/',
      shouldCreateUser: false,
    },
  }]);
  assert.deepEqual(notices, ['Check your email for the secure sign-in link.']);
});

test('authenticated platform admin receives the GFW dashboard', async () => {
  const user = { id: 'user-1', email: 'jose@readytorank.com.au' };
  const rows = {
    user_profiles: { id: user.id, display_name: 'Jose Chavez', is_platform_admin: true },
    clients: { id: 'client-1', slug: 'gluten-free-world', name: 'Gluten Free World' },
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
    },
    from(table) {
      if (table === 'content_assignments') {
        return {
          select() { return this; },
          eq() { return this; },
          order: async () => ({ data: [], error: null }),
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: rows[table], error: null }),
      };
    },
  };
  const dashboards = [];
  const view = {
    showLoading() {},
    showDashboard: (data) => dashboards.push(data),
  };

  const controller = createAuthController({ client, view });
  await controller.initialize();

  assert.equal(dashboards.length, 1);
  assert.equal(dashboards[0].profile.display_name, 'Jose Chavez');
  assert.equal(dashboards[0].client.slug, 'gluten-free-world');
  assert.deepEqual(dashboards[0].assignments, []);
});

test('authenticated non-admin is denied before tenant data is queried', async () => {
  const queried = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'writer-1' } } } }),
    },
    from(table) {
      queried.push(table);
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({
          data: { id: 'writer-1', is_platform_admin: false },
          error: null,
        }),
      };
    },
  };
  const calls = [];
  const view = {
    showLoading() {},
    showDenied: () => calls.push('denied'),
  };

  await createAuthController({ client, view }).initialize();

  assert.deepEqual(calls, ['denied']);
  assert.deepEqual(queried, ['user_profiles']);
});

test('sign out clears the session and returns to sign-in', async () => {
  const calls = [];
  const client = {
    auth: {
      signOut: async () => {
        calls.push('signed-out');
        return { error: null };
      },
    },
  };
  const view = {
    showSignIn: () => calls.push('sign-in'),
  };

  await createAuthController({ client, view }).signOut();

  assert.deepEqual(calls, ['signed-out', 'sign-in']);
});
