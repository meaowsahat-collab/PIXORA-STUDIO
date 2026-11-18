const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use('/vendor/bg-removal', express.static(path.join(__dirname, 'node_modules/@imgly/background-removal/dist')));
app.use('/vendor/onnxruntime-web', express.static(path.join(__dirname, 'node_modules/onnxruntime-web/dist')));
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
