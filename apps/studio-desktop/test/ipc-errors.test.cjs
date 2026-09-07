const test = require('node:test');
const assert = require('node:assert/strict');
const { userFacingIpcErrorMessage } = require('../dist/ipc-errors.js');

test('removes Electron remote-method internals from end-user errors', () => {
  assert.equal(
    userFacingIpcErrorMessage(new Error("Error invoking remote method 'studio:pair-hosted-extension': Error: Reconnect Twitch.")),
    'Reconnect Twitch.'
  );
  assert.equal(userFacingIpcErrorMessage(new Error('Normal application message.')), 'Normal application message.');
  assert.equal(userFacingIpcErrorMessage(''), 'Studio could not complete that action.');
});
