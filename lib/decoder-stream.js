
/**
 * Module dependencies.
 */

var assert = require('assert');
var inherits = require('util').inherits;
var Readable = require('stream').Readable;
var debug = require('debug')('flv:decoder-stream');

// node v0.8.x compat
if (!Readable) Readable = require('readable-stream/readable');

/**
 * Module exports.
 */

module.exports = DecoderStream;

/**
 * The `DecoderStream`.
 *
 * @param {Object} opts optional options object
 * @api public
 */

function DecoderStream (opts) {
  if (!(this instanceof DecoderStream)) return new DecoderStream(opts);
  Readable.call(this, opts);
  this._chunks = [];
}
inherits(DecoderStream, Readable);

/**
 * Readable `_read()` callback function.
 *
 * @param {Number} n number of bytes requested (ignored)
 * @param {Function} done callback function (XXX: remove...)
 * @api private
 */

DecoderStream.prototype._read = function (n, done) {
  if (this._chunks.length > 0) {
    output.call(this);
  } else {
    debug('waiting for a "_chunk" event');
    this.once('_chunk', output);
  }

  function output () {
    debug('output()');
    var next = this._chunks.shift();
    var buf = next[0];
    var fn = next[1];
    fn();

    if (this.push) this.push(buf);
    else done(null, buf); // XXX: old Readable stream API... remove at some point..
  }
};

/**
 * Pushes a Buffer to be read from this `DecoderStream` instance. The `fn`
 * callback function only gets invoked once the ._read() function pulls the buffer
 * out to send to the user.
 *
 * @param {Buffer} buf Buffer instance
 * @param {Function} fn callback function
 * @api private
 */

DecoderStream.prototype._pushAndWait = function (buf, fn) {
  this._chunks.push([ buf, fn ]);
  this.emit('_chunk');
};
