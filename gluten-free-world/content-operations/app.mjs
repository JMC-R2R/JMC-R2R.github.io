export function formatAssignmentStatus(status) {
  return typeof status === 'string' && status.length > 0
    ? status.replaceAll('_', ' ')
    : 'unknown';
}

export async function handleAuthEvent(event, { controller, view }) {
  if (event === 'SIGNED_OUT') {
    view.clearProtectedData();
    view.showSignIn();
    return;
  }
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await controller.initialize();
  }
}

export function createAuthController({ client, view, redirectUrl }) {
  return {
    async initialize() {
      view.showLoading();
      const { data, error } = await client.auth.getSession();
      if (error) {
        throw error;
      }
      const session = data.session;
      if (!session) {
        view.showSignIn();
        return;
      }

      const profileResult = await client
        .from('user_profiles')
        .select('id, display_name, account_type, is_platform_admin')
        .eq('id', session.user.id)
        .single();
      if (profileResult.error || !profileResult.data?.is_platform_admin) {
        view.showDenied();
        return;
      }

      const clientResult = await client
        .from('clients')
        .select('id, slug, name')
        .eq('slug', 'gluten-free-world')
        .single();
      if (clientResult.error) {
        throw clientResult.error;
      }

      const assignmentsResult = await client
        .from('content_assignments')
        .select('id, title, primary_keyword, status, due_at, updated_at')
        .eq('client_id', clientResult.data.id)
        .order('updated_at', { ascending: false });
      if (assignmentsResult.error) {
        throw assignmentsResult.error;
      }

      view.showDashboard({
        profile: profileResult.data,
        client: clientResult.data,
        assignments: assignmentsResult.data,
      });
    },

    async requestMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false,
        },
      });
      if (error) {
        throw error;
      }
      view.showNotice('Check your email for the secure sign-in link.');
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) {
        throw error;
      }
      view.showSignIn();
    },
  };
}
