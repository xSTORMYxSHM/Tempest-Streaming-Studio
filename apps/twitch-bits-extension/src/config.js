(() => {
  'use strict';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  if (!window.Twitch?.ext) {
    set('configState', 'LOCAL PREVIEW');
    set('configDetail', 'Open this page through Twitch Extension Supervisor to validate broadcaster authorization.');
    return;
  }
  window.Twitch.ext.onAuthorized((auth) => {
    const broadcaster = auth.userId && !auth.userId.startsWith('A');
    set('configState', broadcaster ? 'TWITCH AUTHORIZED' : 'IDENTITY REQUIRED');
    set('configDetail', broadcaster ? 'Choose the Tempest Streaming companion in Studio. Live actions, access rules, cooldowns, and placement are published automatically.' : 'Share identity with this Extension to manage the channel connection.');
  });
  window.Twitch.ext.onError(() => set('configState', 'TWITCH LINK ERROR'));
})();
