const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { TwitchChatbot } = require('../dist/chatbot');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryCredentialStore(initial = null) {
  let tokens = initial;
  return {
    available: true,
    async load() { return tokens ? structuredClone(tokens) : null; },
    async save(value) { tokens = structuredClone(value); },
    async clear() { tokens = null; },
    current() { return tokens ? structuredClone(tokens) : null; }
  };
}

test('starts with public-safe commands and no personal response providers', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-public-defaults-'));
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await chatbot.initialize('client123');
  const status = chatbot.status();
  assert.equal(status.providers.weather, undefined);
  assert.equal(status.providers.nowPlaying, undefined);
  assert.ok(status.commands.some((command) => command.name === 'studio' && command.aliases.includes('tempest')));
  assert.ok(status.commands.some((command) => command.name === 'roll' && command.aliases.includes('dice') && command.handler === 'dice-roll'));
  assert.equal(status.commands.some((command) => command.handler === 'local-weather' || command.handler === 'seattle-weather' || command.handler === 'radio-now-playing'), false);
  assert.equal(await chatbot.radioStatus(), null);
});

test('runs chat-triggered 3D dice through the overlay callback and reports the physical result', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-dice-'));
  const rolls = [];
  const messages = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    rollDice: async (request) => {
      rolls.push(request);
      return { expression: '2d6+3', total: 11, reason: request.reason };
    },
    sendPlatformMessage: async (platform, message) => messages.push({ platform, message })
  });
  await chatbot.initialize('client123');

  const preview = await chatbot.testCommand({ message: '!roll 1d20 initiative', viewerName: 'StudioTester', roles: [] });
  assert.equal(preview.accepted, true);
  assert.equal(preview.response, 'StudioTester would roll 1d20 in the 3D Dice Browser Source · initiative.');
  assert.equal(rolls.length, 0);

  const event = {
    schemaVersion: 1,
    id: 'kick-dice-0001',
    topic: 'viewer.chat.message',
    occurredAt: new Date().toISOString(),
    source: 'kick',
    channel: { id: 'kick-channel', login: 'tempest' },
    viewer: { id: 'viewer-1', login: 'dicefan', displayName: 'DiceFan', roles: [] },
    payload: { messageId: 'kick-message-1', text: '!dice 2d6+3 initiative' }
  };
  const result = await chatbot.processChatEvent(event);
  assert.equal(result.accepted, true);
  assert.equal(result.response, 'DiceFan rolled 2d6+3: 11 · initiative');
  assert.deepEqual(rolls, [{ expression: '2d6+3', reason: 'initiative', rollerName: 'DiceFan', simulated: false }]);
  assert.deepEqual(messages, [{ platform: 'kick', message: 'DiceFan rolled 2d6+3: 11 · initiative' }]);
  await chatbot.close();
});

test('persists commands and simulates permissions, replies, and workflow dispatch', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-commands-'));
  const dispatches = [];
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), onCommand: async (dispatch) => dispatches.push(dispatch) });
  await chatbot.initialize('client123');
  const command = await chatbot.upsertCommand({
    name: '!blackhole', aliases: ['bh'], enabled: true, permission: 'moderator',
    response: 'Anomaly detected for {user}: {args}', workflowId: 'com.tempestmainframe.workflow.blackhole',
    viewerCooldownMs: 60_000, globalCooldownMs: 15_000
  });
  assert.equal(command.name, 'blackhole');
  assert.equal(command.replyToViewer, false);
  assert.equal(command.allowSharedChat, false);
  await chatbot.configure({ displayName: 'Orbit Bot' });

  const blocked = await chatbot.testCommand({ message: '!bh maximum', viewerName: 'Viewer', roles: [] });
  assert.equal(blocked.accepted, false);
  assert.match(blocked.reason, /moderator/);

  const accepted = await chatbot.testCommand({ message: '!bh maximum', viewerName: 'Storm', roles: ['moderator'] });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.response, 'Anomaly detected for Storm: maximum');
  assert.equal(dispatches[0].command.workflowId, 'com.tempestmainframe.workflow.blackhole');
  assert.deepEqual(dispatches[0].arguments, ['maximum']);

  const restored = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await restored.initialize('client123');
  assert.ok(restored.status().commands.some((entry) => entry.name === 'blackhole'));
  assert.equal(restored.status().configuredName, 'Orbit Bot');
});

test('applies explicit Shared Chat command policy while keeping permissions home-channel scoped', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-shared-chat-'));
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await chatbot.initialize('client123');

  const publicResult = await chatbot.testCommand({
    message: '!tempest', viewerName: 'PartnerViewer', roles: [], sharedChat: true, sourceChannelLogin: 'partner'
  });
  assert.equal(publicResult.accepted, true);

  const protectedCommand = await chatbot.upsertCommand({
    name: 'scene', enabled: true, permission: 'moderator', response: 'Scene changed.',
    workflowId: 'com.tempestmainframe.workflow.scene', viewerCooldownMs: 0, globalCooldownMs: 0
  });
  assert.equal(protectedCommand.allowSharedChat, false);

  const sharedBlocked = await chatbot.testCommand({
    message: '!scene', viewerName: 'PartnerMod', roles: ['moderator'], sharedChat: true, sourceChannelLogin: 'partner'
  });
  assert.equal(sharedBlocked.accepted, false);
  assert.match(sharedBlocked.reason, /Unavailable from Shared Chat/);

  await chatbot.upsertCommand({ ...protectedCommand, allowSharedChat: true });
  const permissionBlocked = await chatbot.testCommand({
    message: '!scene', viewerName: 'PartnerMod', roles: [], sharedChat: true, sourceChannelLogin: 'partner'
  });
  assert.equal(permissionBlocked.accepted, false);
  assert.match(permissionBlocked.reason, /Requires moderator permission in @studio-test/);

  const explicitlyAllowed = await chatbot.testCommand({
    message: '!scene', viewerName: 'HomeModInSharedChat', roles: ['moderator'], sharedChat: true, sourceChannelLogin: 'partner'
  });
  assert.equal(explicitlyAllowed.accepted, true);
  const activity = chatbot.status().activity;
  assert.equal(activity[0].sharedChat, true);
  assert.equal(activity[0].sourceChannelLogin, 'partner');
});

test('filters links and spam with moderator-safe deletes, exemptions, previews, and timeouts', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-automod-'));
  const requests = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url, options) => {
      requests.push({ url: String(url), options });
      return String(url).includes('/moderation/chat') ? new Response(null, { status: 204 }) : jsonResponse({ data: [{}] });
    }
  });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat', 'moderator:manage:chat_messages', 'moderator:manage:banned_users'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  await chatbot.configure({ autoMod: {
    enabled: true, linkProtectionEnabled: true, allowedDomains: ['twitch.tv'], blockedTermsEnabled: true, blockedTerms: ['spoiler phrase'],
    capsProtectionEnabled: true, capsMinimumLetters: 8, capsPercentage: 75, repetitionProtectionEnabled: true, repetitionLimit: 6,
    exemptRoles: ['broadcaster', 'moderator', 'vip'], action: 'delete', timeoutSeconds: 60, postNotice: false,
    noticeMessage: '@{user}: {reason}'
  } });
  const chatEvent = (id, text, roles = [], viewerId = 'viewer-1') => ({
    schemaVersion: 1, id, topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'twitch',
    channel: { id: 'channel-1', login: 'tempest' }, viewer: { id: viewerId, login: 'viewer', displayName: 'Viewer', roles },
    payload: { messageId: `message-${id}`, text }
  });

  await chatbot.processChatEvent(chatEvent('allowed-link', 'watch https://clips.twitch.tv/example'));
  await chatbot.processChatEvent(chatEvent('mod-link', 'visit suspicious.example', ['moderator']));
  assert.equal(requests.length, 0);

  const deleted = await chatbot.processChatEvent(chatEvent('blocked-link', 'visit suspicious.example now'));
  assert.equal(deleted.accepted, false);
  assert.match(deleted.reason, /unapproved link/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /helix\/moderation\/chat/);
  assert.match(requests[0].url, /message_id=message-blocked-link/);
  assert.equal(requests[0].options.method, 'DELETE');

  const capsPreview = await chatbot.testAutoMod({ message: 'THIS MESSAGE IS TOO LOUD' });
  assert.equal(capsPreview.blocked, true);
  assert.equal(capsPreview.rule, 'caps');
  assert.equal(requests.length, 1);

  await chatbot.configure({ autoMod: { ...chatbot.status().autoMod, action: 'timeout', timeoutSeconds: 90 } });
  const timedOut = await chatbot.processChatEvent(chatEvent('blocked-term', 'that contains a spoiler phrase', [], 'viewer-2'));
  assert.match(timedOut.reason, /timeout/);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /helix\/moderation\/bans/);
  assert.equal(JSON.parse(requests[1].options.body).data.duration, 90);
  assert.equal(chatbot.status().autoMod.actionsTaken, 2);
  await chatbot.close();
});

test('persists streamer-named counters shared by Twitch and Kick chat', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-counter-'));
  const messages = [];
  let catalogChanges = 0;
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), sendPlatformMessage: async (_platform, message) => messages.push(message), onCatalogChanged: () => { catalogChanges += 1; } });
  await chatbot.initialize('client123');
  await chatbot.upsertCommand({ name: 'death', aliases: ['deaths'], enabled: true, permission: 'everyone', response: '{counterLabel}: {counter}', handler: 'counter', counterLabel: 'Ship Restarts', counterValue: 3, viewerCooldownMs: 0, globalCooldownMs: 0 });
  const result = await chatbot.processChatEvent({ schemaVersion: 1, id: 'kick-counter-0001', topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'kick', channel: { id: 'kick-channel', login: 'storm' }, viewer: { id: 'viewer-1', login: 'friend', displayName: 'Friend', roles: [] }, payload: { text: '!death' } });
  assert.equal(result.accepted, true);
  assert.equal(result.response, 'Ship Restarts: 4');
  assert.deepEqual(chatbot.publicCounters(), [{ id: chatbot.publicCounters()[0].id, command: 'death', label: 'Ship Restarts', value: 4 }]);
  assert.deepEqual(messages, ['Ship Restarts: 4']);
  const counterId = chatbot.status().commands.find((entry) => entry.name === 'death').id;
  const adjusted = await chatbot.adjustCounter(counterId, 2, 'Twitch Bits interaction');
  assert.equal(adjusted.value, 6);
  assert.equal(catalogChanges, 3);
  const restored = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await restored.initialize('client123');
  const counter = restored.status().commands.find((entry) => entry.name === 'death');
  assert.equal(counter.counterLabel, 'Ship Restarts');
  assert.equal(counter.counterValue, 6);
});

test('records one numeric poll vote per chat account and keeps aggregate results after voting ends', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-poll-'));
  const pollChanges = [];
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), onPollChanged: (poll) => pollChanges.push(poll) });
  await chatbot.initialize('client123');
  chatbot.startNumericPoll({ question: 'What should we play?', options: ['Game One', 'Game Two', 'Game Three'] });
  const event = (id, text, viewerId, source = 'twitch') => ({
    schemaVersion: 1, id, topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source,
    channel: { id: `${source}-channel`, login: 'tempest' },
    viewer: { id: viewerId, login: viewerId, displayName: viewerId, roles: [] },
    payload: { messageId: `message-${id}`, text }
  });

  await chatbot.processChatEvent(event('vote-1', '2', 'viewer-one'));
  await chatbot.processChatEvent(event('vote-duplicate', '1', 'viewer-one'));
  await chatbot.processChatEvent(event('vote-2', '2', 'viewer-two', 'kick'));
  await chatbot.processChatEvent(event('not-a-vote', 'I choose 3', 'viewer-three'));
  await chatbot.processChatEvent(event('out-of-range', '9', 'viewer-four'));

  const duplicatePanelVote = chatbot.recordNumericPollVote({ pollId: chatbot.status().poll.id, optionNumber: 1, voterId: 'viewer-one', source: 'twitch' });
  assert.equal(duplicatePanelVote.accepted, false);
  assert.equal(duplicatePanelVote.duplicate, true);
  assert.equal(duplicatePanelVote.optionNumber, 2);
  const panelVote = chatbot.recordNumericPollVote({ pollId: chatbot.status().poll.id, optionNumber: 1, voterId: 'viewer-five', source: 'twitch' });
  assert.equal(panelVote.accepted, true);
  assert.equal(panelVote.optionNumber, 1);

  let poll = chatbot.status().poll;
  assert.equal(poll.state, 'active');
  assert.equal(poll.totalVotes, 3);
  assert.deepEqual(poll.options.map((option) => option.votes), [1, 2, 0]);
  assert.equal(poll.options[1].percentage, 66.7);

  chatbot.stopNumericPoll();
  await chatbot.processChatEvent(event('after-close', '1', 'viewer-five'));
  poll = chatbot.status().poll;
  assert.equal(poll.state, 'closed');
  assert.equal(poll.totalVotes, 3);
  chatbot.clearNumericPoll();
  assert.deepEqual(chatbot.status().poll, { state: 'idle', options: [], totalVotes: 0 });
  assert.deepEqual(pollChanges.map((poll) => [poll.state, poll.totalVotes]), [
    ['active', 0], ['active', 1], ['active', 2], ['active', 3], ['closed', 3], ['idle', 0]
  ]);
  await chatbot.close();
});

test('rotates automatic messages when either the chat or time threshold is reached', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-auto-messages-'));
  const sent = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    sendPlatformMessage: async (platform, message) => sent.push({ platform, message })
  });
  await chatbot.initialize('client123');
  await chatbot.configure({ autoMessages: {
    enabled: true,
    messages: ['Remember to follow {channel}.', 'Join the community with {bot}.'],
    intervalMinutes: 0,
    chatMessageThreshold: 2,
    platforms: ['kick']
  } });
  const chatEvent = (id) => ({
    schemaVersion: 1,
    id,
    topic: 'viewer.chat.message',
    occurredAt: new Date().toISOString(),
    source: 'kick',
    channel: { id: 'kick-channel', login: 'storm' },
    viewer: { id: `viewer-${id}`, login: `viewer_${id}`, displayName: `Viewer ${id}`, roles: [] },
    payload: { text: 'hello stream' }
  });

  await chatbot.processChatEvent(chatEvent('one'));
  assert.equal(sent.length, 0);
  await chatbot.processChatEvent(chatEvent('two'));
  assert.deepEqual(sent, [{ platform: 'kick', message: 'Remember to follow the channel.' }]);
  chatbot.autoMessageLastAttemptAt = 0;
  await chatbot.processChatEvent(chatEvent('three'));
  await chatbot.processChatEvent(chatEvent('four'));
  assert.equal(sent[1].message, 'Join the community with Chat Bot.');

  await chatbot.configure({ autoMessages: {
    enabled: true,
    messages: ['Remember to follow {channel}.', 'Join the community with {bot}.'],
    intervalMinutes: 1,
    chatMessageThreshold: 0,
    platforms: ['kick']
  } });
  chatbot.autoMessageWindowStartedAt = Date.now() - 61_000;
  await chatbot.processChatEvent(chatEvent('five'));
  assert.equal(sent[2].message, 'Remember to follow the channel.');
  assert.equal(chatbot.status().autoMessages.sent, 3);
  assert.equal(chatbot.status().autoMessages.messagesSinceLast, 0);
  await chatbot.close();
});

test('monitors Stream Together participants and keeps a native Shared Chat message feed', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-collaboration-'));
  const requests = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/eventsub/subscriptions')) return jsonResponse({}, 202);
      if (String(url).includes('/shared_chat/session')) return jsonResponse({ data: [{ session_id: 'shared-1', host_broadcaster_id: 'channel-1', participants: [{ broadcaster_id: 'channel-1' }, { broadcaster_id: 'channel-2' }] }] });
      if (String(url).includes('/helix/users?')) return jsonResponse({ data: [{ id: 'channel-1', login: 'tempest', display_name: 'Tempest' }, { id: 'channel-2', login: 'collaborator', display_name: 'Collaborator' }] });
      if (String(url).includes('/helix/chat/messages')) return jsonResponse({ data: [{ is_sent: true }] });
      return jsonResponse({});
    }
  });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  chatbot.channel = { clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' };

  await chatbot.subscribeToEvents('eventsub-session');
  const subscriptions = requests.filter((request) => request.url.includes('/eventsub/subscriptions')).map((request) => JSON.parse(request.options.body).type);
  assert.deepEqual(subscriptions, ['channel.chat.message', 'channel.shared_chat.begin', 'channel.shared_chat.update', 'channel.shared_chat.end']);
  assert.equal(chatbot.status().sharedChat.state, 'active');
  assert.equal(chatbot.status().sharedChat.host.login, 'tempest');
  assert.deepEqual(chatbot.status().sharedChat.participants.map((participant) => participant.login), ['tempest', 'collaborator']);

  await chatbot.processChatEvent({
    schemaVersion: 1,
    id: 'source-message-1',
    topic: 'viewer.chat.message',
    occurredAt: '2026-09-12T12:00:00.000Z',
    source: 'twitch',
    channel: { id: 'channel-1', login: 'tempest' },
    viewer: { id: 'viewer-1', login: 'viewer', displayName: 'Viewer', roles: ['subscriber'] },
    payload: { messageId: 'message-1', text: 'Hello from the collaboration!', sharedChat: true, sourceChannelId: 'channel-2', sourceChannelLogin: 'collaborator', sourceChannelDisplayName: 'Collaborator' }
  });
  const message = chatbot.status().messages[0];
  assert.equal(message.text, 'Hello from the collaboration!');
  assert.equal(message.sourceChannelLogin, 'collaborator');
  assert.equal(message.sharedChat, true);

  assert.deepEqual(await chatbot.postMessage({ message: 'Studio is monitoring Shared Chat.' }), { sent: true });
  const sent = requests.find((request) => request.url.includes('/helix/chat/messages'));
  assert.equal(JSON.parse(sent.options.body).message, 'Studio is monitoring Shared Chat.');
  assert.equal(chatbot.clearMessages().messages.length, 0);

  chatbot.applySharedChatEvent('channel.shared_chat.end', { session_id: 'shared-1' });
  assert.equal(chatbot.status().sharedChat.state, 'inactive');
  assert.equal(chatbot.status().sharedChat.participants.length, 0);
});

test('authorizes any secondary Twitch identity and derives or customizes its bot name', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-oauth-'));
  const credentials = memoryCredentialStore();
  const responses = [
    jsonResponse({ device_code: 'device-code', user_code: 'BOT-CODE', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 1 }),
    jsonResponse({ access_token: 'bot-access', refresh_token: 'bot-refresh', expires_in: 14400, scope: ['user:read:chat', 'user:write:chat'] }),
    jsonResponse({ client_id: 'client123', login: 'studio_helper', user_id: 'bot-1', scopes: ['user:read:chat', 'user:write:chat'], expires_in: 14399 })
  ];
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => responses.shift() });
  await chatbot.initialize('client123');
  const device = await chatbot.startDeviceAuthorization();
  assert.equal(device.userCode, 'BOT-CODE');
  const completed = await chatbot.pollDeviceAuthorization();
  assert.equal(completed.status.oauth.account.login, 'studio_helper');
  assert.equal(completed.status.botName, 'studio_helper');
  assert.equal((await chatbot.configure({ displayName: 'StormBot' })).botName, 'StormBot');
  assert.equal((await chatbot.configure({ displayName: '' })).botName, 'studio_helper');
  assert.equal(credentials.current().refreshToken, 'bot-refresh');
});

test('welcomes raiders in chat and sends official shoutouts through a moderator bot token', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-raids-'));
  const requests = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url, options) => {
      requests.push({ url: String(url), options });
      return String(url).includes('/helix/chat/shoutouts')
        ? new Response(null, { status: 204 })
        : jsonResponse({ data: [{ is_sent: true }] });
    }
  });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat', 'moderator:manage:shoutouts'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  await chatbot.configure({ raidAutomation: { welcomeEnabled: true, welcomeMessage: 'Welcome {raider}! Thanks for the {viewers}-viewer raid to {channel}.', shoutoutEnabled: true } });

  const result = await chatbot.processRaidEvent({
    schemaVersion: 1, id: 'raid-event-1', topic: 'viewer.raid.received', occurredAt: new Date().toISOString(), source: 'twitch',
    channel: { id: 'channel-1', login: 'tempest' }, payload: { fromBroadcasterId: 'raider-1', fromBroadcasterName: 'OrbitCaster', viewers: 73 }
  });
  assert.equal(result.welcome, 'sent');
  assert.equal(result.shoutout, 'queued');
  assert.equal(result.message, 'Welcome OrbitCaster! Thanks for the 73-viewer raid to tempest.');
  for (let attempt = 0; attempt < 20 && requests.length < 2; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /helix\/chat\/messages/);
  assert.equal(JSON.parse(requests[0].options.body).message, result.message);
  assert.match(requests[1].url, /helix\/chat\/shoutouts/);
  assert.match(requests[1].url, /from_broadcaster_id=channel-1/);
  assert.match(requests[1].url, /to_broadcaster_id=raider-1/);
  assert.match(requests[1].url, /moderator_id=bot-1/);
  assert.match(chatbot.status().activity.map((entry) => entry.message).join('\n'), /Official Twitch shoutout sent to OrbitCaster/);
  await chatbot.close();
});

test('previews raid automation without posting and reports when shoutout authorization is missing', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-raid-preview-'));
  const requests = [];
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation: async (...args) => { requests.push(args); return jsonResponse({}); } });
  await chatbot.initialize('client123');
  const preview = await chatbot.testRaidAutomation({ raiderName: 'PreviewCaster', viewers: 18 });
  assert.equal(preview.welcome, 'preview');
  assert.equal(preview.shoutout, 'preview');
  assert.match(preview.message, /PreviewCaster/);
  assert.match(preview.message, /18/);
  assert.equal(requests.length, 0);

  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  const live = await chatbot.processRaidEvent({ schemaVersion: 1, id: 'raid-no-scope', topic: 'viewer.raid.received', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel-1' }, payload: { fromBroadcasterId: 'raider-2', fromBroadcasterName: 'NoScopeCaster', viewers: 5 } });
  assert.equal(live.welcome, 'sent');
  assert.equal(live.shoutout, 'authorization-required');
  assert.equal(requests.length, 1);
  await chatbot.close();
});

test('shouts out assigned creators on their first chat once per live stream and persists the handled session', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-first-chat-'));
  const startedAt = '2030-05-01T20:00:00Z';
  const requests = [];
  const fetchImplementation = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/helix/streams')) return jsonResponse({ data: [{ started_at: startedAt, viewer_count: 20 }] });
    if (String(url).includes('/helix/chat/shoutouts')) return new Response(null, { status: 204 });
    return jsonResponse({});
  };
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat', 'moderator:manage:shoutouts'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  await chatbot.configure({ firstChatShoutouts: { enabled: true, channels: ['@Creator_One', 'creator_two'] } });
  const chatEvent = (id, text = 'hello') => ({
    schemaVersion: 1, id, topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel-1', login: 'tempest' },
    viewer: { id: 'creator-1', login: 'creator_one', displayName: 'Creator_One', roles: [] }, payload: { messageId: id, text }
  });

  await chatbot.processChatEvent(chatEvent('first-message'));
  for (let attempt = 0; attempt < 20 && requests.length < 2; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /helix\/streams/);
  assert.match(requests[1].url, /to_broadcaster_id=creator-1/);
  assert.deepEqual(chatbot.status().firstChatShoutouts.channels, ['creator_one', 'creator_two']);
  assert.equal(chatbot.status().firstChatShoutouts.handledSessions, 1);

  await chatbot.processChatEvent(chatEvent('second-message', 'still here'));
  assert.equal(requests.length, 2);
  await chatbot.close();

  const restoredRequests = [];
  const restored = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation: async (url) => {
    restoredRequests.push(String(url));
    return jsonResponse({ data: [{ started_at: startedAt, viewer_count: 22 }] });
  } });
  await restored.initialize('client123');
  restored.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat', 'moderator:manage:shoutouts'] };
  restored.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await restored.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  await restored.processChatEvent(chatEvent('after-restart'));
  assert.deepEqual(restoredRequests, ['https://api.twitch.tv/helix/streams?user_id=channel-1']);
  assert.equal(restored.status().raidAutomation.queuedShoutouts, 0);
  await restored.close();
});

test('does not trigger assigned first-chat shoutouts while the channel is offline', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-first-chat-offline-'));
  const requests = [];
  const chatbot = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation: async (url) => { requests.push(String(url)); return jsonResponse({ data: [] }); } });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat', 'moderator:manage:shoutouts'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: 'bot-1' };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });
  await chatbot.configure({ firstChatShoutouts: { enabled: true, channels: ['creator_one'] } });
  await chatbot.processChatEvent({ schemaVersion: 1, id: 'offline-message', topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel-1' }, viewer: { id: 'creator-1', login: 'creator_one', displayName: 'Creator One', roles: [] }, payload: { messageId: 'offline-message', text: 'hello' } });
  assert.deepEqual(requests, ['https://api.twitch.tv/helix/streams?user_id=channel-1']);
  assert.equal(chatbot.status().firstChatShoutouts.handledSessions, 0);
  await chatbot.close();
});

test('restricts Extension interactions to Twitch-verified assigned creators with staff override', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-interaction-access-'));
  const requests = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/helix/users?')) return jsonResponse({ data: [{ id: '101', login: 'creator_one' }, { id: '202', login: 'creator_two' }] });
      return jsonResponse({});
    }
  });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat'] };
  chatbot.identity = { clientId: 'client123', login: 'studio_helper', userId: '900' };
  await chatbot.configure({
    firstChatShoutouts: { enabled: false, channels: ['creator_one', 'creator_two'] },
    interactionAccess: { mode: 'assigned-creators', allowBroadcasterAndModerators: true }
  });
  assert.equal(requests.length, 1);
  assert.equal(chatbot.status().interactionAccess.resolvedCreators, 2);
  const interaction = (viewer) => ({ schemaVersion: 1, id: `interaction-${viewer.id}`, topic: 'viewer.interaction.requested', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel-1' }, viewer, payload: { action: 'tempest.dance' } });
  assert.equal((await chatbot.authorizeInteraction(interaction({ id: '101', roles: ['viewer'] }))).allowed, true);
  assert.equal((await chatbot.authorizeInteraction(interaction({ id: '303', roles: ['viewer'] }))).code, 'not-assigned');
  assert.equal((await chatbot.authorizeInteraction(interaction({ id: 'Uopaqueviewer', roles: ['viewer'] }))).code, 'identity-required');
  assert.equal((await chatbot.authorizeInteraction(interaction({ id: '303', roles: ['moderator'] }))).allowed, true);
  await chatbot.close();
});

test('serves optional local weather from the National Weather Service without an API key', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-weather-'));
  const requests = [];
  const responses = [
    jsonResponse({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/SEW/124,67/forecast/hourly' } }),
    jsonResponse({ properties: { periods: [{ temperature: 58, temperatureUnit: 'F', shortForecast: 'Light Rain', windSpeed: '7 mph', windDirection: 'SW', relativeHumidity: { value: 81 }, probabilityOfPrecipitation: { value: 70 } }] } })
  ];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url, options) => {
      requests.push({ url: String(url), headers: options?.headers });
      return responses.shift();
    }
  });
  await chatbot.initialize('client123');
  await chatbot.configure({ weatherProvider: { provider: 'nws', locationName: 'Portland', latitude: 45.5152, longitude: -122.6784, timeZone: 'America/Los_Angeles' } });
  await chatbot.upsertCommand({ name: 'weather', enabled: true, permission: 'everyone', response: '', handler: 'local-weather', viewerCooldownMs: 15_000, globalCooldownMs: 10_000 });
  const first = await chatbot.testCommand({ message: '!weather', viewerName: 'Storm', roles: [] });
  assert.equal(first.accepted, true);
  assert.match(first.response, /Portland:/);
  assert.match(first.response, /58°F · Light Rain · Humidity 81% · Rain 70% · Wind SW 7 mph/);
  assert.equal(requests.length, 2);
  assert.match(String(requests[0].headers['User-Agent']), /TempestStreamingStudio/);

  const second = await chatbot.testCommand({ message: '!weather', viewerName: 'Storm', roles: [] });
  assert.equal(second.accepted, true);
  assert.equal(requests.length, 2);
});

test('serves a configurable AzuraCast station with an outage-safe fallback', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-radio-'));
  const requests = [];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url, options) => {
      requests.push({ url: String(url), headers: options?.headers });
      return jsonResponse({
        is_online: true,
        station: { name: 'Example Radio' },
        now_playing: { song: { artist: 'Aster Null', title: 'Error Stars', album: 'The Coordinates Are Laughing', text: 'Aster Null - Error Stars' } }
      });
    }
  });
  await chatbot.initialize('client123');
  const provider = { provider: 'azuracast', stationName: 'Example Radio', apiUrl: 'https://radio.example/api/nowplaying/station', publicPlayerUrl: 'https://radio.example/public/station', streamUrl: 'https://radio.example/listen/station/radio.mp3' };
  await chatbot.configure({ nowPlayingProvider: provider });
  await chatbot.upsertCommand({ name: 'song', aliases: ['nowplaying'], enabled: true, permission: 'everyone', response: '', handler: 'radio-now-playing', viewerCooldownMs: 15_000, globalCooldownMs: 10_000 });

  const first = await chatbot.testCommand({ message: '!song', viewerName: 'SampleViewer', roles: [] });
  assert.equal(first.accepted, true);
  assert.equal(first.response, 'Now playing on Example Radio: Aster Null — Error Stars · Album: The Coordinates Are Laughing · Listen: https://radio.example/public/station');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://radio.example/api/nowplaying/station');
  assert.match(String(requests[0].headers['User-Agent']), /TempestStreamingStudio/);

  const second = await chatbot.testCommand({ message: '!nowplaying', viewerName: 'SampleViewer', roles: [] });
  assert.equal(second.accepted, true);
  assert.equal(second.response, first.response);
  assert.equal(requests.length, 1);
  const status = await chatbot.radioStatus();
  assert.equal(status.state, 'online');
  assert.equal(status.name, 'Example Radio');
  assert.equal(status.nowPlaying.title, 'Error Stars');
  assert.equal(requests.length, 1);

  const failingChatbot = new TwitchChatbot({
    dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-radio-outage-')),
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async () => jsonResponse({}, 503)
  });
  await failingChatbot.initialize('client123');
  await failingChatbot.configure({ nowPlayingProvider: provider });
  await failingChatbot.upsertCommand({ name: 'song', aliases: ['nowplaying'], enabled: true, permission: 'everyone', response: '', handler: 'radio-now-playing', viewerCooldownMs: 15_000, globalCooldownMs: 10_000 });
  const unavailable = await failingChatbot.testCommand({ message: '!song', viewerName: 'Storm', roles: [] });
  assert.equal(unavailable.accepted, true);
  assert.match(unavailable.response, /now-playing signal is temporarily unavailable/);
  assert.match(unavailable.response, /radio\.example/);
  assert.equal((await failingChatbot.radioStatus()).state, 'unavailable');
});

test('migrates the official Storm Horizon !song link without changing its API or stream endpoints', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-radio-link-migration-'));
  const oldProvider = {
    provider: 'azuracast',
    stationName: 'Storm Horizon Radio',
    apiUrl: 'https://a12.asurahosting.com/api/nowplaying/storm_horizon_radio',
    publicPlayerUrl: 'https://a12.asurahosting.com/public/storm_horizon_radio',
    streamUrl: 'https://a12.asurahosting.com/listen/storm_horizon_radio/radio.mp3'
  };
  const original = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await original.initialize('client123');
  await original.configure({ nowPlayingProvider: oldProvider });

  const migrated = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await migrated.initialize('client123');
  assert.deepEqual(migrated.status().providers.nowPlaying, {
    ...oldProvider,
    publicPlayerUrl: 'https://www.tempestmainframe.com/listen'
  });

  const persisted = new TwitchChatbot({ dataDirectory, credentialStore: memoryCredentialStore() });
  await persisted.initialize('client123');
  assert.equal(persisted.status().providers.nowPlaying.publicPlayerUrl, 'https://www.tempestmainframe.com/listen');
});

test('installs a command directory and serves cached Twitch channel information without new scopes', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-chatbot-builtins-'));
  const requests = [];
  const startedAt = new Date(Date.now() - (2 * 60 + 14) * 60_000).toISOString();
  const responses = [
    jsonResponse({ data: [{ started_at: startedAt, viewer_count: 42 }] }),
    jsonResponse({ data: [{ title: 'Building Tempest Streaming Studio', game_name: 'Software and Game Development' }] }),
    jsonResponse({ data: { segments: [{ title: 'Mainframe Monday', start_time: '2030-01-07T20:00:00Z' }] } })
  ];
  const chatbot = new TwitchChatbot({
    dataDirectory,
    credentialStore: memoryCredentialStore(),
    fetchImplementation: async (url) => {
      requests.push(String(url));
      return responses.shift();
    }
  });
  await chatbot.initialize('client123');
  chatbot.tokens = { accessToken: 'bot-access', refreshToken: 'bot-refresh', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: ['user:read:chat', 'user:write:chat'] };
  await chatbot.connectChannel({ clientId: 'client123', channelId: 'channel-1', channelLogin: 'tempest' });

  const directory = await chatbot.testCommand({ message: '!commands', viewerName: 'Viewer', roles: [] });
  assert.equal(directory.accepted, true);
  assert.match(directory.response, /!studio/);
  assert.match(directory.response, /!uptime/);
  assert.match(directory.response, /!schedule/);
  assert.doesNotMatch(directory.response, /!song/);

  const uptime = await chatbot.testCommand({ message: '!uptime', viewerName: 'Viewer', roles: [] });
  assert.match(uptime.response, /Stream uptime: 2h 14m · 42 viewers/);
  const title = await chatbot.testCommand({ message: '!title', viewerName: 'Viewer', roles: [] });
  assert.equal(title.response, 'Current title: Building Tempest Streaming Studio');
  const game = await chatbot.testCommand({ message: '!game', viewerName: 'Viewer', roles: [] });
  assert.equal(game.response, 'Current category: Software and Game Development');
  const schedule = await chatbot.testCommand({ message: '!schedule', viewerName: 'Viewer', roles: [] });
  assert.match(schedule.response, /Next stream:/);
  assert.match(schedule.response, /Mainframe Monday/);

  assert.equal(requests.length, 3);
  assert.match(requests[0], /helix\/streams\?user_id=channel-1/);
  assert.match(requests[1], /helix\/channels\?broadcaster_id=channel-1/);
  assert.match(requests[2], /helix\/schedule\?broadcaster_id=channel-1&first=1/);
});
