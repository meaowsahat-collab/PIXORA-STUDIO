const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(express.static(__dirname));

app.use((req, res, next) => {
  if (req.method === 'GET' && !path.extname(req.path)) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

app.listen(PORT, HOST, () => {
  console.log(`IXORA Studio listening on http://${HOST}:${PORT}`);
});
