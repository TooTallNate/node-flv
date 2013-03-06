node-flv
========
### FLV media container file format encoder and decoder
[![Build Status](https://travis-ci.org/TooTallNate/node-flv.png?branch=master)](https://travis-ci.org/TooTallNate/node-flv)

This module offers `Encoder` and `Decoder` stream classes for working with FLV
media files.


Installation
------------

Install through npm:

``` bash
$ npm install flv
```


Example
-------


``` javascript
var fs = require('fs');
var flv = require('flv');

// create a readable stream to some FLV file
var file = fs.createReadStream('GtzZP3CsK4g.flv');

var decoder = new flv.Decoder();

decoder.on('metadata', function (name, data) {
  // "name" is a String, "data" is an Object/Array
  console.error('"metadata" event %j %j', name, data);
});

decoder.on('audio', function (audio) {
  // "audio" is a Readable stream of audio data
  // the type of audio data depends on the FLV file, could be AAC, MP3, etc.
  audio.pipe(fs.createWriteStream('output.mp3'));
});

decoder.on('video', function (video) {
  // "video" is a Readable stream of video data
  // the type of video data depends on the FLV file, could be H.263, On2 VP6, etc.
  video.pipe(fs.createWriteStream('output.h263'));
});

// pipe the FLV file to the Decoder instance
file.pipe(decoder);
```


API
---

Coming soon!
