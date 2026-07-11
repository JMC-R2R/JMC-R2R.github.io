import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
import { createAuthController, formatAssignmentStatus, formatTargetPublishAt, handleAuthEvent } from './app.mjs';

const config = window.R2R_STAGING_CONFIG;
const sections = ['loading', 'sign-in', 'denied', 'dashboard', 'fatal'];

function showSection(id) {
  for (const section of sections) {
    document.getElementById(section).hidden = section !== id;
  }
}

function assignmentMarkup(assignment) {
  const row = document.createElement('article');
  row.className = 'assignment';

  const copy = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'assignment-title';
  title.textContent = assignment.title;
  const meta = document.createElement('div');
  meta.className = 'assignment-meta';
  meta.textContent = `${assignment.primary_keyword || 'No primary keyword'} · Publication target: ${formatTargetPublishAt(assignment.target_publish_at)}`;
  copy.append(title, meta);

  const status = document.createElement('span');
  status.className = 'assignment-status';
  status.textContent = formatAssignmentStatus(assignment.status);
  row.append(copy, status);
  return row;
}

const view = {
  showLoading() { showSection('loading'); },
  showSignIn() {
    showSection('sign-in');
    document.getElementById('notice').textContent = '';
  },
  showDenied() { showSection('denied'); },
  showNotice(message) {
    document.getElementById('notice').textContent = message;
  },
  clearProtectedData() {
    document.getElementById('assignment-list').replaceChildren();
    document.getElementById('assignment-count').textContent = '0';
    document.getElementById('client-name').textContent = 'Gluten Free World';
    document.title = 'Content Operations — Ready to Rank';
  },
  showDashboard({ profile, client, assignments }) {
    showSection('dashboard');
    document.getElementById('client-name').textContent = client.name;
    document.getElementById('assignment-count').textContent = String(assignments.length);
    const list = document.getElementById('assignment-list');
    const empty = document.getElementById('empty-state');
    list.replaceChildren(...assignments.map(assignmentMarkup));
    list.hidden = assignments.length === 0;
    empty.hidden = assignments.length > 0;
    document.title = `${client.name} — ${profile.display_name}`;
  },
  showFatal(error) {
    showSection('fatal');
    document.getElementById('fatal-message').textContent = error?.message || 'Please refresh and try again.';
  },
};

if (!config?.supabaseUrl || !config?.publishableKey) {
  view.showFatal(new Error('Staging configuration is unavailable.'));
} else {
  const client = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const controller = createAuthController({
    client,
    view,
    redirectUrl: window.location.origin + window.location.pathname,
    clientId: config.clientId,
  });

  document.getElementById('sign-in-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      await controller.requestMagicLink(new FormData(event.currentTarget).get('email').trim());
    } catch (error) {
      view.showNotice(error.message || 'Sign-in failed.');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('sign-out').addEventListener('click', () => controller.signOut().catch(view.showFatal));
  document.getElementById('denied-sign-out').addEventListener('click', () => controller.signOut().catch(view.showFatal));

  client.auth.onAuthStateChange((event) => {
    queueMicrotask(() => handleAuthEvent(event, { controller, view }).catch(view.showFatal));
  });
  controller.initialize().catch(view.showFatal);
}
