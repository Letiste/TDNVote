const path = require('path');
const express = require('express');
const app = require('./public/App.js');

const server = express();

server.use(express.static(path.join(__dirname, 'public')));
server.get('*', function (req, res) {
  const { html } = app.render({ url: req.url });

  res.write(`
  <!DOCTYPE html>
  <link rel ="stylesheet" href="/bundle.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Rye">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Abhaya Libre">
  <body style="margin:0px">${html}</body>
  <script defer src="/bundle.js"></script>`);

  res.end();
});

const port = process.env.port || 3000;
server.listen(port, () =>
  console.log(`Listening on port ${port}`)
);
