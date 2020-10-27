const path = require('path');
const express = require('express');
const app = require('./public/build/App.js');

const server = express();

server.use(express.static(path.join(__dirname, 'public')));
server.get('*', function (req, res) {
  const { html } = app.render({ url: req.url });

  res.write(`
  <!DOCTYPE html>
  <link rel ="stylesheet" href="/global.css">
  <link rel ="stylesheet" href="/bundle.css">
  <body>${html}</body>
  <script defer src="/build/bundle.js"></script>`);

  res.end();
});

const port = process.env.port || 3000;
server.listen(port, '192.168.1.43', () =>
  console.log(`Listening on port ${port}`)
);
