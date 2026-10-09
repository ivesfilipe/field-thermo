const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { TIPOS_ATIVIDADE, statusOsVisual, statusAtividadeVisual, equipesDoUsuario } = require('../../calendario');
const { sqlEnderecoCompleto, sqlEnderecoLocalOuCliente } = require('../../endereco');

const router = express.Router();

router.use(authenticate, requireRole('tecnico'));

router.get('/agenda', (req, res) => {
  const { data_inicio, data_fim } = req.query;

  const equipeIds = equipesDoUsuario(req.user.id);

  const condOs = [equipeIds.length > 0 ? `o.equipe_id IN (${equipeIds.map(() => '?').join(',')})` : '1 = 0', "o.status NOT IN ('cancelada', 'excluida')"];
  const condAtv = [];
  const paramsOs = [...equipeIds];
  const paramsAtv = [];
  if (equipeIds.length > 0) {
    condAtv.push(`(a.equipe_id IN (${equipeIds.map(() => '?').join(',')}) OR a.tecnico_id = ?)`);
    paramsAtv.push(...equipeIds, req.user.id);
  } else {
    condAtv.push('a.tecnico_id = ?');
    paramsAtv.push(req.user.id);
  }

  if (data_inicio) {
    condOs.push('o.data_agendada >= ?');
    condAtv.push('a.data >= ?');
    paramsOs.push(data_inicio);
    paramsAtv.push(data_inicio);
  }
  if (data_fim) {
    condOs.push('o.data_agendada <= ?');
    condAtv.push('a.data <= ?');
    paramsOs.push(data_fim);
    paramsAtv.push(data_fim);
  }

  const ordens = db
    .prepare(
      `SELECT o.id, o.numero, o.servico, o.prioridade, o.data_agendada, o.hora_inicio, o.hora_fim,
        o.confirmada, o.status, o.local_id,
        c.nome AS cliente_nome, l.nome AS local_nome, ${sqlEnderecoLocalOuCliente('l', 'c')}, e.nome AS equipamento_nome,
        ${sqlEnderecoCompleto('l', 'local_endereco_completo', 'c')}
       FROM ordens_servico o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN locais l ON l.id = o.local_id
       LEFT JOIN equipamentos e ON e.id = o.equipamento_id
       WHERE ${condOs.join(' AND ')}
       ORDER BY o.data_agendada, o.hora_inicio`
    )
    .all(...paramsOs);

  const atividades = db
    .prepare(
      `SELECT a.id, a.titulo, a.tipo, a.os_id, a.data, a.hora_inicio, a.hora_fim, a.status,
        a.observacoes, o.numero AS os_numero,
        c.nome AS cliente_nome, l.nome AS local_nome, ${sqlEnderecoLocalOuCliente('l', 'c')},
        ${sqlEnderecoCompleto('l', 'local_endereco_completo', 'c')}
       FROM atividades a
       LEFT JOIN ordens_servico o ON o.id = a.os_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN locais l ON l.id = a.local_id
       WHERE ${condAtv.join(' AND ')}
       ORDER BY a.data, a.hora_inicio`
    )
    .all(...paramsAtv);

  const agenda = [
    ...ordens.map((o) => ({
      kind: 'os',
      id: o.id,
      referencia: o.numero,
      titulo: o.servico,
      descricao: null,
      cliente_nome: o.cliente_nome,
      local_nome: o.local_nome,
      local_endereco: o.local_endereco,
      local_endereco_completo: o.local_endereco_completo,
      equipamento_nome: o.equipamento_nome,
      prioridade: o.prioridade,
      data: o.data_agendada,
      hora_inicio: o.hora_inicio,
      hora_fim: o.hora_fim,
      status: statusOsVisual(o),
      status_base: o.status
    })),
    ...atividades.map((a) => ({
      kind: 'atividade',
      id: a.id,
      referencia: a.os_numero ? `${a.os_numero} · Atividade #${a.id}` : `Atividade #${a.id}`,
      titulo: a.titulo,
      descricao: TIPOS_ATIVIDADE[a.tipo] || a.tipo,
      cliente_nome: a.cliente_nome,
      local_nome: a.local_nome,
      local_endereco: a.local_endereco,
      local_endereco_completo: a.local_endereco_completo,
      equipamento_nome: null,
      prioridade: null,
      data: a.data,
      hora_inicio: a.hora_inicio,
      hora_fim: a.hora_fim,
      status: statusAtividadeVisual(a),
      status_base: a.status,
      os_id: a.os_id,
      observacoes: a.observacoes
    }))
  ];

  agenda.sort((a, b) => `${a.data || ''}${a.hora_inicio || ''}`.localeCompare(`${b.data || ''}${b.hora_inicio || ''}`));

  res.json({ agenda });
});

module.exports = router;
