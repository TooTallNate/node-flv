
/**
 * Module dependencies.
 */

var fs = require('fs');
var flv = require('../');
var path = require('path');
var assert = require('assert');

describe('Decoder', function () {

  describe('barsandtone.flv', function () {
    var fixture = path.resolve(__dirname, 'fixtures', 'barsandtone.flv');

    it('should emit one "metadata" event', function (done) {
      var r = new fs.createReadStream(fixture);
      var d = new flv.Decoder();
      d.on('metadata', function (name, data) {
        assert.equal('onMetaData', name);
        assert.equal(data.duration, 6);
        assert.equal(data.width, 360);
        assert.equal(data.height, 288);
        assert.equal(data.videodatarate, 400);
        assert.equal(data.framerate, 10);
        assert.equal(data.videocodecid, 4);
        assert.equal(data.audiodatarate, 96);
        assert.equal(data.audiodelay, 0.038);
        assert.equal(data.audiocodecid, 2);
        assert.equal(data.canSeekToEnd, true);
        assert.equal(data.length, 0);
        assert(Array.isArray(data));
        done();
      });
      r.pipe(d);
    });

    it('should emit one "audio" event', function (done) {
      var r = new fs.createReadStream(fixture);
      var d = new flv.Decoder();
      d.on('audio', function (audio) {
        audio.resume(); // flow
        done();
      });
      r.pipe(d);
    });

    it('should emit an audio "end" event', function (done) {
      var r = new fs.createReadStream(fixture);
      var d = new flv.Decoder();
      d.on('audio', function (audio) {
        audio.resume(); // flow
        audio.on('end', done);
      });
      r.pipe(d);
    });

    it('should emit one "video" event', function (done) {
      var r = new fs.createReadStream(fixture);
      var d = new flv.Decoder();
      d.on('audio', function (audio) {
        audio.resume(); // flow - just to keep the decoder from hanging
      });
      d.on('video', function (video) {
        video.resume(); // flow
        done();
      });
      r.pipe(d);
    });

    it('should emit a video "end" event', function (done) {
      var r = new fs.createReadStream(fixture);
      var d = new flv.Decoder();
      d.on('audio', function (audio) {
        audio.resume(); // flow - just to keep the decoder from hanging
      });
      d.on('video', function (video) {
        video.resume(); // flow
        video.on('end', done);
      });
      r.pipe(d);
    });

  });

});
