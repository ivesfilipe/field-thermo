// Entry point para cPanel / Phusion Passenger / PM2
const app = require('./server/index');
const config = require('./server/config');

const port = process.env.PORT || config.PORT || 3001;

// Se ainda não estiver escutando, inicia o listener
try {
  if (!app.listening) {
    app.listen(port, () => {
      console.log(`FIELD 2.0 API rodando na porta ${port}`);
    });
  }
} catch {
  // Ignora se já estiver escutando
}

module.exports = app;
