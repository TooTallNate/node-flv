
/**
 * Module dependencies.
 */

var inherits = require('util').inherits;
var Writable = require('stream').Writable;
var Parser = require('stream-parser');
var debug = require('debug')('flv:decoder');

// node v0.8.x compat
if (!Writable) Writable = require('readable-stream/writable');

/**
 * Module exports.
 */

module.exports = Decoder;

/**
 * The `Decoder` class is a `Writable` stream that expects an FLV file to be
 * written to it, and it will output the embedded streams in "stream" events.
 * A "metadata" event gets emitted when the Metadata at the beginning of the file
 * has been parsed.
 *
 * Reference:
 *  - http://osflash.org/flv#flv_format
 *  - http://en.wikipedia.org/wiki/Flash_Video
 *
 * @param {Object} opts optional "options" object
 * @api public
 */

function Decoder (opts) {
  if (!(this instanceof Decoder)) return new Decoder(opts);
  debug('creating new Decoder instance');
  Writable.call(this, opts);

  this._bytes(3, this._onsignature);
}
inherits(Decoder, Writable);

/**
 * Mixin `Parser`.
 */

Parser(Decoder.prototype);

Decoder.prototype._onsignature = function (buf) {
  var sig = buf.toString('ascii');
  debug('onsignature(%j)', sig);
  if ('FLV' != sig) {
    return this.emit('error', new Error('invalid FLV signature: ' + JSON.stringify(sig)));
  }
  this.signature = sig;
  this._bytes(1, this._onversion);
};

Decoder.prototype._onversion = function (buf) {
  var ver = buf.readUInt8(0);
  debug('onversion(%d)', ver);
  if (1 !== ver) {
    // currently 1 is the only version for known FLV files
    return this.emit('error', new Error('expected flv version 1, got: ' + ver));
  }
  this.version = ver;
  this._bytes(1, this._onflags);
};

Decoder.prototype._onflags = function (buf) {
  var flags = buf.readUInt8(0);
  debug('onflags(%d)', flags);
  this.flags = flags;
  this._bytes(4, this._onoffset);
};

Decoder.prototype._onoffset = function (buf) {
  var offset = buf.readUInt32BE(0);
  debug('onoffset(%d)', offset);
  // assert offset === 9
  this.offset = offset;
  this._bytes(4, this._onprevioustagsize);
};

Decoder.prototype._onprevioustagsize = function (buf) {
  var size = buf.readUInt32BE(0);
  debug('onprevioustagsize(%d)', size);
  // assert size === 0
  this._bytes(1, this._ontagtype);
};

Decoder.prototype._ontagtype = function (buf) {
  var type = buf.readUInt8(0);
  debug('ontagtype(%d)', type);
  this.currentTag = { type: type };
  this._bytes(3, this._ontagbodylength);
};

Decoder.prototype._ontagbodylength = function (buf) {
  var length = readUInt24BE(buf, 0);
  debug('ontagbodylength(%d)', length);
  this.currentTag.bodyLength = length;
  //this._bytes(3, this._ontagtimestamp);
  this._bytes(4, this._ontagtimestamp);
};

Decoder.prototype._ontagtimestamp = function (buf) {
  //var time = readUInt24BE(buf, 0);
  var time = buf.readUInt32BE(0);
  debug('ontagtimestamp(%d)', time);
  this.currentTag.timestamp = time;
  this._bytes(3, this._ontagstreamid);
};

Decoder.prototype._ontagstreamid = function (buf) {
  var id = readUInt24BE(buf, 0);
  debug('ontagstreamid(%d)', id);
  this.currentTag.id = id;
  this._bytes(this.currentTag.bodyLength, this._ontagbody);
};

Decoder.prototype._ontagbody = function (buf) {
  debug('ontagbody(%d bytes)', buf.length);
  this.currentTag.body = buf;
  switch (this.currentTag.type) {
    case 0x08: // audio
      debug('got "audio" tag');
      var meta = buf.readUInt8(0);
      var soundType = (meta & 0x01) >> 0; // 0: mono, 1: stereo
      var soundSize = (meta & 0x02) >> 1; // 0: 8-bit, 1: 16-bit
      var soundRate = (meta & 0x0C) >> 2; // 0: 5.5 kHz (or speex 16kHz), 1: 11 kHz, 2: 22 kHz, 3: 44 kHz
      var soundFormat = (meta & 0xf0) >> 4; // 0: Uncompressed, 1: ADPCM, 2: MP3, 5: Nellymoser 8kHz mono, 6: Nellymoser, 11: Speex
      this.currentTag.soundType = soundType;
      this.currentTag.soundSize = soundSize;
      this.currentTag.soundRate = soundRate;
      this.currentTag.soundFormat = soundFormat;
      //console.error(this.currentTag);

      // the raw audio data Buffer (MP3 data or whatever...)
      this.audioData = buf.slice(1);

      // TODO: output to an "audio stream"
      break;
    case 0x09: // video
      debug('got "video" tag');

      // TODO: output to a "video stream"
      break;
    case 0x12: // metadata
      debug('got "metadata" tag');
      // metadata is in AMF format, you must use an external amf-parser
      // to get useful information from the "metadata" event
      this.emit('metadata', this.currentTag);
      break;
    default:
      this.emit('error', new Error('unknown tag type: ' + this.currentTag.type));
      return;
  }
  this._bytes(4, this._onprevioustagsize);
};

/**
 * Node.js Buffer class doesn't have readUInt24...
 */

function readUInt24BE (buffer, offset) {
  var val = 0;
  val |= buffer[offset + 2];
  val |= buffer[offset + 1] << 8;
  val |= buffer[offset + 0] << 16;
  return val;
}
