
/**
 * Module dependencies.
 */

var amf = require('amf');
var assert = require('assert');
var inherits = require('util').inherits;
var Writable = require('stream').Writable;
var Parser = require('stream-parser');
var debug = require('debug')('flv:decoder');
var DecoderStream = require('./decoder-stream');

// node v0.8.x compat
if (!Writable) Writable = require('readable-stream/writable');

/**
 * Module exports.
 */

module.exports = Decoder;

/**
 * The `Decoder` class is a `Writable` stream that expects an FLV file to be
 * written to it, and it will output the embedded audio and video stream in
 * "audio" and "video" events (respectively).
 *
 * A "metadata" event gets emitted every time a metadata chunk is encountered
 * inside the FLV file.
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

  this.once('finish', this._onfinish);
  this._streams = [];
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
  var len = this.currentTag.bodyLength;
  if (0 == len) {
    // this shouldn't really happen, but _bytes() throws an assertion error
    // if 0 is passed in, so just skip to the next step if 0 is reported
    this._bytes(4, this._onprevioustagsize);
  } else {
    this._bytes(len, this._ontagbody);
  }
};

Decoder.prototype._ontagbody = function (buf, fn) {
  debug('ontagbody(%d bytes)', buf.length);

  // queue the next step before we start any async stuff
  this._bytes(4, this._onprevioustagsize);

  var stream;
  this.currentTag.body = buf;
  switch (this.currentTag.type) {
    case 0x08: // audio
      debug('got "audio" tag');
      stream = this._stream();
      var meta = buf.readUInt8(0);
      var soundType = (meta & 0x01) >> 0; // 0: mono, 1: stereo
      var soundSize = (meta & 0x02) >> 1; // 0: 8-bit, 1: 16-bit
      var soundRate = (meta & 0x0C) >> 2; // 0: 5.5 kHz (or speex 16kHz), 1: 11 kHz, 2: 22 kHz, 3: 44 kHz
      var soundFormat = (meta & 0xf0) >> 4; // 0: Uncompressed, 1: ADPCM, 2: MP3, 5: Nellymoser 8kHz mono, 6: Nellymoser, 10: AAC, 11: Speex, more
      this.currentTag.soundType = soundType;
      this.currentTag.soundSize = soundSize;
      this.currentTag.soundRate = soundRate;
      this.currentTag.soundFormat = soundFormat;
      //console.error(this.currentTag);

      if (soundFormat == 10) {
        // AAC audio needs special handling
        var aacType = buf.readUInt8(1);
        var bits;
        if (0 == aacType) {
          // AAC sequence header
          // This is an AudioSpecificConfig as specified in ISO 14496-3
          var header = buf.slice(2);
          assert(header.length >= 2);

          bits = ((header[0] & 0xff) * 256 + (header[1] & 0xff)) << 16;
          stream.aacProfile = readBits(bits, 5) - 1;
          bits <<= 5;
          stream.sampleRateIndex = readBits(bits, 4);
          bits <<= 4;
          stream.channelConfig = readBits(bits, 4);

          fn();
        } else {
          // AAC raw (no ADTS header)
          var audioData = buf.slice(2);
          var dataSize = audioData.length;

          // need to construct an ADTS header manually...
          // see http://wiki.multimedia.cx/index.php?title=ADTS for format spec
          // https://github.com/gangverk/flvdemux/blob/master/src/com/gangverk/FLVDemuxingInputStream.java
          // http://codeartisan.tumblr.com/post/11943952404/playing-flv-wrapped-aac-streams-from-android
          var adts = new Buffer(7);
          bits = 0;
          bits = writeBits(bits, 12, 0xFFF);
          bits = writeBits(bits, 3, 0);
          bits = writeBits(bits, 1, 1);
          adts[0] = (bits >> 8);
          adts[1] = (bits);

          bits = 0;
          bits = writeBits(bits, 2, stream.aacProfile);
          bits = writeBits(bits, 4, stream.sampleRateIndex);
          bits = writeBits(bits, 1, 0);
          bits = writeBits(bits, 3, stream.channelConfig);
          bits = writeBits(bits, 4, 0);
          bits = writeBits(bits, 2, (dataSize + 7) & 0x1800);

          adts[2] = (bits >> 8);
          adts[3] = (bits);

          bits = 0;
          bits = writeBits(bits, 11, (dataSize + 7) & 0x7FF);
          bits = writeBits(bits, 11, 0x7FF);
          bits = writeBits(bits, 2, 0);
          adts[4] = (bits >> 16);
          adts[5] = (bits >> 8);
          adts[6] = (bits);

          // first write the ADTS header
          stream._pushAndWait(adts, function () {
            // then write the raw AAC data
            stream._pushAndWait(audioData, fn);
          });

          // alternate way using `Buffer.concat()` instead - benchmark someday
          /*var b = Buffer.concat([ adts, audioData ]);
          stream._pushAndWait(b, fn);*/
        }
      } else {
        // the raw audio data Buffer (MP3 data or whatever...)
        this.currentTag.audioData = buf.slice(1);
        stream._pushAndWait(this.currentTag.audioData, fn);
      }
      break;
    case 0x09: // video
      debug('got "video" tag');
      // TODO: implement
      stream = this._stream();
      fn();
      break;
    case 0x12: // metadata
      debug('got "metadata" tag');
      // metadata is in AMF format, 2 packets
      var position = { offset: 0 };

      // first packet is an AMF "string", the event name
      var name = amf.read(buf, position);
      this.currentTag.name = name;

      // second packet is the "data" payload, which is an AMF "array"
      var data = amf.read(buf, position);
      this.currentTag.data = data;

      this.emit('metadata', name, data, this.currentTag);
      fn();
      break;
    default:
      this.emit('error', new Error('unknown tag type: ' + this.currentTag.type));
      return;
  }
};

/**
 * Returns a `DecoderStream` instance that corresponds with the current "tag"
 * being parsed.
 *
 * @return {DecoderStream} The DecoderStream instance for the current "tag"
 * @api private
 */

Decoder.prototype._stream = function () {
  var name = this.currentTag.type + '-' + this.currentTag.id;
  var stream = this[name];
  var type = this.currentTag.type;
  if (!stream) {
    debug('creating DecoderStream instance for %j', name);
    stream = this[name] = new DecoderStream();

    // also add them to an array so that we can iterate the streams in "finish"
    this._streams.push(stream);

    // emit an "audio" or "video" event
    if (0x08 == type) { // audio
      name = 'audio';
    } else if (0x09 == type) { // video
      name = 'video';
    } else {
      throw new Error('unsupported "stream" type: ' + type);
    }
    this.emit(name, stream);
  }
  return stream;
};

/**
 * Called for the Decoder's "finish" event. Pushes the `null` packet to the audio
 * and/or video stream in the FLV file, so that they emit "end".
 *
 * @api private
 */

Decoder.prototype._onfinish = function () {
  debug('"finish" event');
  this._streams.forEach(function (stream) {
    stream._pushAndWait(null, function () {
      debug('`null` packet flushed');
    });
  });
  this._streams.splice(0); // empty
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

function readBits (x, length) {
  return (x >> (32 - length));
}

function writeBits (x, length, value) {
  var mask = 0xffffffff >> (32 - length);
  x = (x << length) | (value & mask);
  return x;
}
