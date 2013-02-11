node-flv
========
### FLV media container file format encoder and decoder
[![Build Status](https://secure.travis-ci.org/TooTallNate/node-flv.png)](http://travis-ci.org/TooTallNate/node-flv)

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
var amf = require('amf');

// create a readable stream to some FLV file
var file = fs.createReadStream('GtzZP3CsK4g.flv');

var decoder = new flv.Decoder();

decoder.on('metadata', function (data) {
});

decoder.on('audio', function (audio) {

});

decoder.on('video', function (video) {

});

// pipe the FLV file to the Decoder instance
file.pipe(decoder);
```


API
---

