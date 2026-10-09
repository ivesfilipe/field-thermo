const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

router.get('/avaliacoes', (req, res) => {
  const { status, cliente_id } = req.query;
  let sql = `
    SELECT a.id, a.os_id, a.token, a.status, a.nota, a.resolveu_necessidade, a.comentario,
      a.respondida_em, a.criado_em,
      o.numero AS os_numero, o.servico, o.data_agendada,
      c.id AS cliente_id, c.nome AS cliente_nome,
      eq.nome AS equipe_nome,
      u.nome AS executor_nome, ex.concluida_em AS atendimento_concluido_em
    FROM avaliacoes a
    JOIN ordens_servico o ON o.id = a.os_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN equipes eq ON eq.id = o.equipe_id
    LEFT JOIN execucoes ex ON ex.os_id = o.id
    LEFT JOIN usuarios u ON u.id = ex.tecnico_id
    WHERE 1 = 1`;
  const params = [];
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (cliente_id) {
    sql += ' AND o.cliente_id = ?';
    params.push(cliente_id);
  }
  sql += ' ORDER BY a.criado_em DESC, a.id DESC';
  const avaliacoes = db.prepare(sql).all(...params);

  const ind = db
    .prepare(
      `SELECT
        ROUND(AVG(nota), 2) AS nota_media,
        COUNT(*) AS total,
        SUM(CASE WHEN nota = 5 THEN 1 ELSE 0 END) AS n5,
        SUM(CASE WHEN nota = 4 THEN 1 ELSE 0 END) AS n4,
        SUM(CASE WHEN nota = 3 THEN 1 ELSE 0 END) AS n3,
        SUM(CASE WHEN nota IN (1, 2) THEN 1 ELSE 0 END) AS n12,
        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) AS pendentes
       FROM avaliacoes`
    )
    .get();

  res.json({
    avaliacoes,
    indicadores: {
      nota_media: ind.nota_media || 0,
      total: ind.total || 0,
      n5: ind.n5 || 0,
      n4: ind.n4 || 0,
      n3: ind.n3 || 0,
      n12: ind.n12 || 0,
      pendentes: ind.pendentes || 0
    }
  });
});

module.exports = router;