const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { guardGuiProcessOutput } = require('../dist/process-output');

test('ignores a closed launcher pipe without hiding other stream errors', () => {
  const stream = new EventEmitter();
  const unexpected = [];
  guardGuiProcessOutput([stream], (error) => unexpected.push(error));

  assert.doesNotThrow(() => stream.emit('error', Object.assign(new Error('closed'), { code: 'EPIPE' })));
  stream.emit('error', Object.assign(new Error('failed'), { code: 'EIO' }));

  assert.equal(unexpected.length, 1);
  assert.equal(unexpected[0].code, 'EIO');
});
