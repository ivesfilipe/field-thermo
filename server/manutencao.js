const MENSAGEM_MANUTENCAO =
  'Sistema em manutenção. Acesso liberado apenas para técnicos para coleta de assinaturas.';

const MANUTENCAO_ATIVA = false;

function manutencaoAtiva() {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.MANUTENCAO === '1') return true;
  if (process.env.MANUTENCAO === '0') return false;
  return MANUTENCAO_ATIVA;
}

function bloqueioManutencao(req, res, next) {
  if (!manutencaoAtiva()) return next();
  if (req.path.startsWith('/relatorios/publico/')) return next();
  return res.status(503).json({ error: MENSAGEM_MANUTENCAO });
}

module.exports = { MENSAGEM_MANUTENCAO, manutencaoAtiva, bloqueioManutencao };
