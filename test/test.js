var request = require(`supertest`)
  , fs = require(`fs`)
  , http = require(`http`)
  , https = require(`https`)
  , url = require(`url`)
  , png = fs.readFileSync(`test/fixtures/test.png`)
  , app = require(`../lib/image-proxy`)();

function server(req, res) {
  var path = url.parse(req.url).pathname;
  if (path === `/301`) {
    res.writeHead(301, {
      'Location': `http://localhost:8080/test.png`
    });
    res.end();
  }
  else if (path === `/302`) {
    res.writeHead(302, {
      'Location': `http://localhost:8080/test.png`
    });
    res.end();
  }
  else if (path === `/location-relative`) {
    res.writeHead(302, {
      'Location': `/test.png`
    });
    res.end();
  }
  else if (path === `/location-empty`) {
    res.writeHead(302, {
      'Location': ``
    });
    res.end();
  }
  else if (path === `/location-missing`) {
    res.writeHead(302);
    res.end();
  }
  else if (path === `/404`) {
    res.writeHead(404);
    res.end();
  }
  else if (path === `/content-type-invalid`) {
    res.writeHead(200, {
      'Content-Type': `text/plain`
    });
    res.end();
  }
  else if (path === `/content-type-empty`) {
    res.writeHead(200, {
      'Content-Type': ``
    });
    res.end();
  }
  else if (path === `/content-type-missing`) {
    res.writeHead(200);
    res.end();
  }
  else if (path === `/timeout`) {
    res.writeHead(200, {
      'Content-Type': `image/png`
    });
    setTimeout(function () {
      res.end(png, `binary`);
    }, 1000);
  }
  else if (path === `/complex.png`) {
    res.writeHead(200, {
      'Content-Type': `image/png; charset=utf-8`
    });
    res.end(png, `binary`);
  }
  else if (path === `/test.png`) {
    res.writeHead(200, {
      'Content-Type': `image/png`
    });
    res.end(png, `binary`);
  }
  else if (path === `/error-without-accept-header`) {
    if (req.headers[`accept`]) {
      res.writeHead(200, {
        'Content-Type': `image/png`
      });
      res.end(png, `binary`);
    }
    else {
      res.writeHead(403);
      res.end();
    }
  }
  else {
    res.writeHead(500);
    res.end(path);
  }
}

var options = {
  // https://raw.githubusercontent.com/joyent/node/master/test/fixtures/keys/agent2-cert.pem
  cert: fs.readFileSync(`test/fixtures/server-cert.pem`)
  // https://raw.githubusercontent.com/joyent/node/master/test/fixtures/keys/agent2-key.pem
, key: fs.readFileSync(`test/fixtures/server-key.pem`)
};

// @see https://github.com/mikeal/request/issues/418
process.env.NODE_TLS_REJECT_UNAUTHORIZED = `0`;
http.createServer(server).listen(8080);
https.createServer(options, server).listen(8081);

const testPngUrl = new Buffer(`http://localhost:8080/test.png`).toString(`base64`)


describe(`GET /:url/:width/:height.:extension?`, function () {
  it(`fails if a host is not in the whitelist`, function (done) {
    let tempUrl = new Buffer(`http://google.com`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected URI host to be whitelisted`, done);
  });

  it(`fails if width is a non-integer`, function (done) {
    request(app)
      .get(`/${testPngUrl}/noninteger/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected width to be an integer`, done);
  });
  it(`fails if width is too large`, function (done) {
    request(app)
      .get(`/${testPngUrl}/1001/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected width to be less than or equal to 1000`, done);
  });
  it(`fails if height is a non-integer`, function (done) {
    request(app)
      .get(`/${testPngUrl}/100/noninteger`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected height to be an integer`, done);
  });
  it(`fails if height is too large`, function (done) {
    request(app)
      .get(`/${testPngUrl}/100/1001`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected height to be less than or equal to 1000`, done);
  });

  it(`fails if the protocol is unsupported`, function (done) {
    request(app)
      .get(`/ftp%3A%2F%2Flocalhost:8080/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected URI scheme to be HTTP or HTTPS`, done);
  });
  it(`fails if the host is empty`, function (done) {
    let tempUrl = new Buffer(`http://`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected URI host to be non-empty`, done);
  });

  it(`follows 301 redirects`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/301`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(`Cache-Control`, `max-age=31536000, public`)
      .expect(200, done);
  });
  it(`follows 302 redirects`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/302`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(`Cache-Control`, `max-age=31536000, public`)
      .expect(200, done);
  });
  it(`follows local redirects`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/location-relative`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(`Cache-Control`, `max-age=31536000, public`)
      .expect(200, done);
  });
  it(`fails if the Location header is empty`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/location-empty`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected response code 200, got 302`, done);
  });
  it(`fails if the Location header is missing`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/location-missing`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected response code 200, got 302`, done);
  });

  it(`fails if the status code is not 200`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/404`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected response code 200, got 404`, done);
  });

  it(`fails if the content type is invalid`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/content-type-invalid`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected content type image/gif, image/jpeg, image/png, image/jpg, got text/plain`, done);
  });
  it(`fails if the content type is empty`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/content-type-empty`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected content type image/gif, image/jpeg, image/png, image/jpg, got `, done);
  });
  it(`fails if the content type is missing`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/content-type-missing`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `text/html; charset=utf-8`)
      .expect(404, `Expected content type image/gif, image/jpeg, image/png, image/jpg, got `, done);
  });
  it(`parses a complex content type`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/complex.png`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(200, done);
  });
  it(`returns the requested content type`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/complex.png`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100.jpg`)
      .expect(`Content-Type`, `image/jpeg`)
      .expect(200, done);
  });

  it(`timesout if the request takes too long`, function (done) {
    let tempUrl = new Buffer(`http://localhost:8080/timeout`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(504, function () {
        setTimeout(done, 1000);
      });
  });

  it(`supports HTTP`, function (done) {
    request(app)
      .get(`/${testPngUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(`Cache-Control`, `max-age=31536000, public`)
      .expect(200, done);
  });
  it(`supports HTTPS`, function (done) {
    let tempUrl = new Buffer(`https://localhost:8081/test.png`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(`Content-Type`, `image/png`)
      .expect(`Cache-Control`, `max-age=31536000, public`)
      .expect(200, done);
  });

  it(`sends an accept header in the request`, function (done) {
    let tempUrl = new Buffer(`https://localhost:8081/error-without-accept-header`).toString(`base64`)
    request(app)
      .get(`/${tempUrl}/100/100`)
      .expect(200, done);
  });
});
