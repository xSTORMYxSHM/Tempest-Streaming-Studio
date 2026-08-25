(() => {
  'use strict';
  const storageKey = 'tempest-extension-configuration-v1';
  const defaultPanelDesign = { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING STUDIO', eyebrow: 'VIEWER CONTROL NODE', title: 'Signal deck', accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 10, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true };
  const $ = (selector) => document.querySelector(selector);
  let deployed = false;

  function normalizePanelDesign(value) { return { ...defaultPanelDesign, ...(value && typeof value === 'object' ? value : {}) }; }
  function populatePanelDesign(value) {
    const design = normalizePanelDesign(value);
    $('#configPanelPreset').value = design.preset; $('#configPanelBrandName').value = design.brandName; $('#configPanelEyebrow').value = design.eyebrow; $('#configPanelTitle').value = design.title; $('#configPanelAccent').value = design.accent; $('#configPanelBackground').value = design.background; $('#configPanelSurface').value = design.surface; $('#configPanelText').value = design.text; $('#configPanelMuted').value = design.muted; $('#configPanelFont').value = design.font; $('#configPanelLayout').value = design.cardLayout; $('#configPanelDensity').value = design.density; $('#configPanelRadius').value = design.cornerRadius; $('#configPanelShowLogo').checked = design.showLogo; $('#configPanelShowStatus').checked = design.showStatus; $('#configPanelShowSearch').checked = design.showSearch; $('#configPanelShowFilters').checked = design.showFilters; $('#configPanelShowPattern').checked = design.showPattern; $('#configPanelUppercase').checked = design.uppercaseLabels;
  }
  function readPanelDesign() { return { schemaVersion: 1, preset: $('#configPanelPreset').value, brandName: $('#configPanelBrandName').value.trim(), eyebrow: $('#configPanelEyebrow').value.trim(), title: $('#configPanelTitle').value.trim(), accent: $('#configPanelAccent').value, background: $('#configPanelBackground').value, surface: $('#configPanelSurface').value, text: $('#configPanelText').value, muted: $('#configPanelMuted').value, font: $('#configPanelFont').value, cardLayout: $('#configPanelLayout').value, density: $('#configPanelDensity').value, cornerRadius: Number($('#configPanelRadius').value), showLogo: $('#configPanelShowLogo').checked, showStatus: $('#configPanelShowStatus').checked, showSearch: $('#configPanelShowSearch').checked, showFilters: $('#configPanelShowFilters').checked, showPattern: $('#configPanelShowPattern').checked, uppercaseLabels: $('#configPanelUppercase').checked }; }

  async function load() {
    try {
      const response = await fetch('runtime-config.json', { cache: 'no-store' });
      const runtime = response.ok ? await response.json() : {};
      if (runtime.schemaVersion === 1 && typeof runtime.ebsBaseUrl === 'string' && runtime.ebsBaseUrl) {
        deployed = true;
        $('#ebsBaseUrl').value = runtime.ebsBaseUrl;
        $('#ebsBaseUrl').disabled = true;
        $('#mockMode').checked = false;
        $('#mockMode').disabled = true;
        $('#saveConfiguration').disabled = true;
        $('#saveState').textContent = 'Managed by hosted build';
        populatePanelDesign(runtime.panelDesign);
        return;
      }
    } catch { /* Local source previews use browser configuration. */ }
    try {
      const configuration = JSON.parse(localStorage.getItem(storageKey) || '{}');
      $('#ebsBaseUrl').value = configuration.ebsBaseUrl || '';
      $('#mockMode').checked = configuration.mockMode !== false;
      populatePanelDesign(configuration.panelDesign);
    } catch { $('#mockMode').checked = true; populatePanelDesign(defaultPanelDesign); }
  }

  function save() {
    if (deployed) return;
    const ebsBaseUrl = $('#ebsBaseUrl').value.trim().replace(/\/$/, '');
    if (ebsBaseUrl && new URL(ebsBaseUrl).protocol !== 'https:') throw new Error('The EBS URL must use HTTPS.');
    const configuration = { schemaVersion: 1, ebsBaseUrl, mockMode: $('#mockMode').checked, updatedAt: new Date().toISOString() };
    localStorage.setItem(storageKey, JSON.stringify(configuration));
    $('#saveState').textContent = 'Configuration saved';
  }

  function savePanelAppearance() {
    const panelDesign = readPanelDesign();
    if (window.Twitch?.ext?.configuration?.set) {
      window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify({ panelDesign }));
      $('#panelAppearanceState').textContent = 'Saved for this Twitch channel';
      return;
    }
    const configuration = JSON.parse(localStorage.getItem(storageKey) || '{}');
    localStorage.setItem(storageKey, JSON.stringify({ ...configuration, schemaVersion: 1, panelDesign, updatedAt: new Date().toISOString() }));
    $('#panelAppearanceState').textContent = 'Saved in local preview';
  }

  void load();
  $('#saveConfiguration').addEventListener('click', () => {
    try { save(); } catch (error) { $('#saveState').textContent = error.message; }
  });
  $('#savePanelAppearance').addEventListener('click', () => { try { savePanelAppearance(); } catch (error) { $('#panelAppearanceState').textContent = error.message; } });
  if (window.Twitch?.ext) {
    window.Twitch.ext.onAuthorized((authorization) => { $('#configIdentity').textContent = authorization.channelId ? `CHANNEL ${authorization.channelId}` : 'TWITCH AUTHORIZED'; });
    window.Twitch.ext.configuration?.onChanged(() => {
      try { const content = window.Twitch.ext.configuration.broadcaster?.content; if (content) populatePanelDesign(JSON.parse(content).panelDesign); }
      catch { $('#panelAppearanceState').textContent = 'Could not read saved channel theme'; }
    });
  }
})();
