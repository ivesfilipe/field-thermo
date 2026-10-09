const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

router.get('/equipes', (req, res) => {
  const equipes = db
    .prepare(
      `SELECT e.id, e.nome, e.descricao,
        (SELECT COUNT(DISTINCT u.id) FROM usuarios u
          WHERE (u.equipe_id = e.id OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id = e.id))
            AND u.perfil = 'tecnico') AS total_tecnicos
       FROM equipes e ORDER BY e.nome`
    )
    .all();
  res.json({ equipes });
});

router.get('/tecnicos', (req, res) => {
  const tecnicos = db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.equipe_id,
        COALESCE(e.nome, GROUP_CONCAT(ee.nome)) AS equipe_nome
       FROM usuarios u
       LEFT JOIN equipes e ON e.id = u.equipe_id
       LEFT JOIN usuarios_equipes ue ON ue.usuario_id = u.id
       LEFT JOIN equipes ee ON ee.id = ue.equipe_id
       WHERE u.perfil = 'tecnico' AND u.ativo = 1
       GROUP BY u.id
       ORDER BY u.nome`
    )
    .all();
  res.json({ tecnicos });
});

router.get('/equipes/atividades', (req, res) => {
  const equipes = db
    .prepare(
      `SELECT e.id, e.nome, e.descricao,
        (SELECT COUNT(DISTINCT u.id) FROM usuarios u
          WHERE (u.equipe_id = e.id OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id = e.id))
            AND u.perfil = 'tecnico' AND u.ativo = 1) AS total_tecnicos
       FROM equipes e ORDER BY e.nome`
    )
    .all();

  const resultado = equipes.map((equipe) => {
    const membros = db
      .prepare(
        `SELECT DISTINCT u.id, u.nome, u.email
         FROM usuarios u
         WHERE (u.equipe_id = ? OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id = ?))
           AND u.perfil = 'tecnico' AND u.ativo = 1
         ORDER BY u.nome`
      )
      .all(equipe.id, equipe.id);

    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS os_total,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) AS os_pendentes,
          SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) AS os_em_andamento,
          SUM(CASE WHEN status = 'aguardando_validacao' THEN 1 ELSE 0 END) AS os_aguardando_validacao,
          SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) AS os_concluidas,
          SUM(CASE WHEN status IN ('pendente', 'em_andamento') AND data_agendada < date('now') THEN 1 ELSE 0 END) AS os_atrasadas
         FROM ordens_servico
         WHERE equipe_id = ? AND status != 'excluida'`
      )
      .get(equipe.id);

    const statsAtividades = db
      .prepare(
        `SELECT
          COUNT(*) AS atv_total,
          SUM(CASE WHEN status = 'agendada' THEN 1 ELSE 0 END) AS atv_agendadas,
          SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) AS atv_em_andamento,
          SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) AS atv_concluidas
         FROM atividades
         WHERE equipe_id = ? OR tecnico_id IN (SELECT id FROM usuarios WHERE equipe_id = ? OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = id AND ue.equipe_id = ?))`
      )
      .get(equipe.id, equipe.id, equipe.id);

    const ids = membros.map((u) => u.id);
    const lugar = ids.length > 0 ? ids.map(() => '?').join(',') : 'NULL';

    const ultimasAtividades = ids.length > 0
      ? db
          .prepare(
            `SELECT h.tipo, h.campo, h.valor_anterior, h.valor_novo, h.usuario_nome, h.criado_em
             FROM historico h
             WHERE h.usuario_id IN (${lugar})
             ORDER BY h.criado_em DESC, h.id DESC
             LIMIT 10`
          )
          .all(...ids)
      : [];

    return {
      ...equipe,
      tecnicos: membros,
      stats: {
        os_total: stats.os_total || 0,
        os_pendentes: stats.os_pendentes || 0,
        os_em_andamento: stats.os_em_andamento || 0,
        os_aguardando_validacao: stats.os_aguardando_validacao || 0,
        os_concluidas: stats.os_concluidas || 0,
        os_atrasadas: stats.os_atrasadas || 0,
        atv_total: statsAtividades.atv_total || 0,
        atv_agendadas: statsAtividades.atv_agendadas || 0,
        atv_em_andamento: statsAtividades.atv_em_andamento || 0,
        atv_concluidas: statsAtividades.atv_concluidas || 0
      },
      ultimasAtividades
    };
  });

  res.json({ equipes: resultado });
});

module.exports = router;
