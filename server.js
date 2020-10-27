const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser')
const app = require('./public/App.js');
const path = require('path')
const fs = require('fs')

const server = express();

const corsOptions = {
  origin: ['http://localhost:3000', 'http://192.168.1.43:3000']}

server.use(cors(corsOptions))

server.use(bodyParser.json())

server.use(express.static(path.join(__dirname, 'public')));

const directoryPath = path.join(__dirname, 'routes');

// Automatically add routes to the app
fs.readdir(directoryPath, function (err, files) {
  if (err) {
    return console.log('Unable to scan directory : ' + err);
  }
  files.forEach((file) => {
    require(`./routes/${file}`)(server);
  });
});


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
