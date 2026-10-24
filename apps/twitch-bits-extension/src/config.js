(() => {
  'use strict';

  const defaults = { schemaVersion: 1, dock: 'left', startExpanded: false, showActionCount: true };
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  const form = document.getElementById('quickPreferences');
  let authorized = false;

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      ...defaults,
      dock: source.dock === 'right' ? 'right' : 'left',
      startExpanded: source.startExpanded === true,
      showActionCount: source.showActionCount !== false
    };
  }

  function readSaved() {
    const content = window.Twitch?.ext?.configuration?.broadcaster?.content;
    if (!content) return defaults;
    try { return normalize(JSON.parse(content)); } catch { return defaults; }
  }

  function renderPreferences(value, saved = false) {
    const preferences = normalize(value);
    document.getElementById('overlayDock').value = preferences.dock;
    document.getElementById('overlayStart').value = preferences.startExpanded ? 'expanded' : 'collapsed';
    document.getElementById('showActionCount').checked = preferences.showActionCount;
    set('configSaveState', saved ? 'SAVED BY TWITCH' : 'USING SAFE DEFAULTS');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!authorized || !window.Twitch?.ext?.configuration?.set) {
      set('configSaveState', 'OPEN IN TWITCH TO SAVE');
      return;
    }
    const button = document.getElementById('saveQuickPreferences');
    const preferences = normalize({
      dock: document.getElementById('overlayDock').value,
      startExpanded: document.getElementById('overlayStart').value === 'expanded',
      showActionCount: document.getElementById('showActionCount').checked
    });
    button.disabled = true;
    set('configSaveState', 'SAVING…');
    try {
      window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(preferences));
      set('configSaveState', 'SAVED BY TWITCH');
    } catch {
      set('configSaveState', 'SAVE FAILED — TRY AGAIN');
    } finally {
      setTimeout(() => { button.disabled = false; }, 500);
    }
  });

  renderPreferences(defaults);
  if (!window.Twitch?.ext) {
    set('configState', 'LOCAL PREVIEW');
    set('configDetail', 'Open this page through Twitch Extension Supervisor to validate broadcaster authorization.');
    return;
  }

  window.Twitch.ext.configuration.onChanged(() => {
    const saved = Boolean(window.Twitch.ext.configuration.broadcaster?.content);
    renderPreferences(readSaved(), saved);
  });
  window.Twitch.ext.onAuthorized((auth) => {
    const broadcaster = auth.userId && !auth.userId.startsWith('A');
    authorized = Boolean(broadcaster);
    set('configState', broadcaster ? 'TWITCH AUTHORIZED' : 'IDENTITY REQUIRED');
    set('configDetail', broadcaster ? 'Basic display preferences can be saved here. Studio publishes the live actions, access rules, cooldowns, and placement automatically.' : 'Share identity with this Extension to manage the channel connection.');
  });
  window.Twitch.ext.onError(() => set('configState', 'TWITCH LINK ERROR'));
})();
