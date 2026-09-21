import { api } from './api.js';

export const app = $state({ user: null, ready: false, unread: 0, toast: '' });

export async function loadMe() {
  try {
    app.user = (await api('/me')).user;
  } catch {
    app.user = null;
  }
  app.ready = true;
  return app.user;
}

let t;
export const notice = (msg) => {
  app.toast = msg;
  clearTimeout(t);
  t = setTimeout(() => (app.toast = ''), 3000);
};

export const canCreateProject = () => app.user && app.user.role !== 'CLIENT';
export const isOwner = () => app.user?.role === 'OWNER';
