const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('comercial', 'gestor', 'admin'));

router.get('/avaliacoes', (req, res) => {
  const clientes = db
    .prepare(
      `SELECT c.id, c.nome,
        ROUND(AVG(a.nota), 2) AS nota_media,
        COUNT(a.id) AS total,
        SUM(CASE WHEN a.nota >= 4 THEN 1 ELSE 0 END) AS positivas,
        SUM(CASE WHEN a.nota <= 2 THEN 1 ELSE 0 END) AS negativas,
        SUM(CASE WHEN a.status = 'pendente' THEN 1 ELSE 0 END) AS pendentes
       FROM clientes c
       JOIN ordens_servico o ON o.cliente_id = c.id
       JOIN avaliacoes a ON a.os_id = o.id
       GROUP BY c.id, c.nome
       ORDER BY c.nome`
    )
    .all();

  const avaliacoes = db
    .prepare(
      `SELECT a.id, a.os_id, a.status, a.nota, a.resolveu_necessidade, a.comentario, a.respondida_em,
        o.numero AS os_numero, o.servico, o.data_agendada,
        c.id AS cliente_id, c.nome AS cliente_nome,
        eq.nome AS equipe_nome, u.nome AS executor_nome
       FROM avaliacoes a
       JOIN ordens_servico o ON o.id = a.os_id
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN equipes eq ON eq.id = o.equipe_id
       LEFT JOIN execucoes ex ON ex.os_id = o.id
       LEFT JOIN usuarios u ON u.id = ex.tecnico_id
       ORDER BY a.criado_em DESC, a.id DESC`
    )
    .all();

  res.json({ clientes, avaliacoes });
});

module.exports = router;