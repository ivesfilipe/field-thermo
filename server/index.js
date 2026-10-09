const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');

fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));

app.use(express.json());
app.use('/uploads', express.static(config.UPLOADS_DIR));

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const publicaAvaliacaoRoutes = require('./routes/publica/avaliacao');
app.use('/api/avaliacao', publicaAvaliacaoRoutes);

const adminUsuariosRoutes = require('./routes/admin/usuarios');
const adminEquipesRoutes = require('./routes/admin/equipes');
const adminVeiculosRoutes = require('./routes/admin/veiculos');
app.use('/api/admin', adminUsuariosRoutes, adminEquipesRoutes, adminVeiculosRoutes);

const gestorClientesRoutes = require('./routes/gestor/clientes');
const gestorLocaisRoutes = require('./routes/gestor/locais');
const gestorEquipamentosRoutes = require('./routes/gestor/equipamentos');
const gestorApoioRoutes = require('./routes/gestor/apoio');
const gestorOsRoutes = require('./routes/gestor/os');
const gestorCalendarioRoutes = require('./routes/gestor/calendario');
const gestorMapaRoutes = require('./routes/gestor/mapa');
const gestorPlanejamentoRoutes = require('./routes/gestor/planejamento');
const gestorAvaliacoesRoutes = require('./routes/gestor/avaliacoes');
const gestorKmRoutes = require('./routes/gestor/km');
app.use('/api/gestor', gestorClientesRoutes, gestorLocaisRoutes, gestorEquipamentosRoutes, gestorApoioRoutes, gestorOsRoutes, gestorCalendarioRoutes, gestorMapaRoutes, gestorPlanejamentoRoutes, gestorAvaliacoesRoutes, gestorKmRoutes);

const tecnicoOsRoutes = require('./routes/tecnico/os');
const tecnicoAgendaRoutes = require('./routes/tecnico/agenda');
const tecnicoKmRoutes = require('./routes/tecnico/km');
app.use('/api/tecnico', tecnicoOsRoutes, tecnicoAgendaRoutes, tecnicoKmRoutes);

const comercialRelatoriosRoutes = require('./routes/comercial/relatorios');
const comercialOportunidadesRoutes = require('./routes/comercial/oportunidades');
const comercialAvaliacoesRoutes = require('./routes/comercial/avaliacoes');
app.use('/api/comercial', comercialRelatoriosRoutes, comercialOportunidadesRoutes, comercialAvaliacoesRoutes);

app.get('/api/health', (req, res) => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((t) => t.name);
  res.json({ status: 'ok', db: config.DB_PATH, tables });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;

if (require.main === module) {
  if (config.IS_PRODUCTION && config.JWT_SECRET === 'field20_secret_desenvolvimento_local') {
    console.error('ERRO: Defina um JWT_SECRET forte em .env antes de iniciar em produção.');
    process.exit(1);
  }
  app.listen(config.PORT, () => {
    console.log(`Thermo control API rodando em http://localhost:${config.PORT}`);
  });
}
