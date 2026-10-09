const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hojeLocal } = require('../../calendario');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const STATUS_MAPA = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  disponivel: 'Disponível para equipe',
  em_deslocamento: 'Em deslocamento',
  em_atendimento: 'Em atendimento',
  aguardando_validacao: 'Aguardando validação',
  aguardando_complemento: 'Aguardando complemento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  atrasada: 'Atrasada'
};

function statusMapa(os) {
  if (os.status === 'cancelada') return 'cancelada';
  if (os.status === 'concluida') return 'concluida';
  if (os.status === 'aguardando_validacao') return 'aguardando_validacao';
  if (os.status === 'em_deslocamento') return 'em_deslocamento';
  if (os.status === 'em_andamento') return os.complemento_solicitado ? 'aguardando_complemento' : 'em_atendimento';
  if (os.confirmada) return 'confirmada';
  if (!os.equipe_id) {
    if (os.data_agendada && os.data_agendada < hojeLocal()) return 'atrasada';
    return 'disponivel';
  }
  return 'agendada';
}

function condicaoStatus(status) {
  const base = {
    agendada: "o.status = 'pendente' AND o.equipe_id IS NOT NULL AND o.confirmada = 0",
    confirmada: "o.status = 'pendente' AND o.confirmada = 1",
    disponivel: "o.status = 'pendente' AND o.equipe_id IS NULL",
    em_atendimento: "o.status = 'em_andamento' AND (ex.complemento_solicitado IS NULL OR ex.complemento_solicitado = '')",
    aguardando_complemento: "o.status = 'em_andamento' AND ex.complemento_solicitado IS NOT NULL AND ex.complemento_solicitado != ''",
    atrasada: `o.status = 'pendente' AND o.data_agendada IS NOT NULL AND o.data_agendada < date('now')`
  };
  return base[status] || `o.status = '${status}'`;
}

router.get('/mapa', (req, res) => {
  const { equipe_id, status, cliente_id, data, data_inicio, data_fim } = req.query;
  const condicoes = ["o.status != 'excluida'"];
  const params = [];
  if (equipe_id) {
    condicoes.push('o.equipe_id = ?');
    params.push(Number(equipe_id));
  }
  if (status) {
    condicoes.push(condicaoStatus(status));
  }
  if (cliente_id) {
    condicoes.push('o.cliente_id = ?');
    params.push(Number(cliente_id));
  }
  if (data) {
    condicoes.push('o.data_agendada = ?');
    params.push(data);
  } else if (data_inicio && data_fim) {
    condicoes.push('o.data_agendada IS NOT NULL AND o.data_agendada BETWEEN ? AND ?');
    params.push(data_inicio, data_fim);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const ordens = db
    .prepare(
      `SELECT o.id, o.numero, o.servico, o.descricao, o.prioridade, o.status, o.confirmada,
        o.tipo_atendimento, o.data_agendada, o.hora_inicio, o.hora_fim,
        o.cliente_id, c.nome AS cliente_nome,
        o.local_id, l.nome AS local_nome, l.endereco, l.cidade, l.estado, l.cep, l.latitude, l.longitude,
        o.equipe_id, eq.nome AS equipe_nome,
        ex.tecnico_id AS executor_id, ex.iniciada_em,
        COALESCE(u.nome, t.nome) AS executor_nome,
        ex.complemento_solicitado,
        e.id AS mt_id, e.codigo_mt, e.patrimonio, e.tipo AS mt_tipo, e.fabricante AS mt_fabricante,
        e.modelo AS mt_modelo, e.capacidade AS mt_capacidade, e.gas_refrigerante AS mt_gas,
        e.local AS mt_local, e.ambiente AS mt_ambiente
       FROM ordens_servico o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN locais l ON l.id = o.local_id
       LEFT JOIN equipes eq ON eq.id = o.equipe_id
       LEFT JOIN execucoes ex ON ex.os_id = o.id
       LEFT JOIN usuarios u ON u.id = ex.tecnico_id
       LEFT JOIN usuarios t ON t.id = o.tecnico_id
       LEFT JOIN equipamentos e ON e.id = o.equipamento_id
       ${where}
       ORDER BY o.data_agendada, o.hora_inicio`
    )
    .all(...params)
    .map((os) => {
      const status = statusMapa(os);
      const temCoordenadas = os.latitude != null && os.longitude != null;
      const enderecoCompleto = [os.endereco, os.cidade, os.estado].filter(Boolean).join(', ');
      return {
        id: os.id,
        numero: os.numero,
        servico: os.servico,
        descricao: os.descricao,
        prioridade: os.prioridade,
        status_base: os.status,
        status,
        status_label: STATUS_MAPA[status] || status,
        confirmada: !!os.confirmada,
        tipo_atendimento: os.tipo_atendimento,
        data_agendada: os.data_agendada,
        hora_inicio: os.hora_inicio,
        hora_fim: os.hora_fim,
        cliente_id: os.cliente_id,
        cliente_nome: os.cliente_nome,
        local_id: os.local_id,
        local_nome: os.local_nome,
        endereco: os.endereco,
        cidade: os.cidade,
        estado: os.estado,
        cep: os.cep,
        latitude: os.latitude,
        longitude: os.longitude,
        endereco_completo: enderecoCompleto,
        tem_localizacao: temCoordenadas,
        equipe_id: os.equipe_id,
        equipe_nome: os.equipe_nome,
        executor_id: os.executor_id,
        executor_nome: os.executor_nome,
        iniciada_em: os.iniciada_em,
        mt: os.mt_id
          ? {
              id: os.mt_id,
              codigo_mt: os.codigo_mt,
              patrimonio: os.patrimonio,
              tipo: os.mt_tipo,
              fabricante: os.mt_fabricante,
              modelo: os.mt_modelo,
              capacidade: os.mt_capacidade,
              gas: os.mt_gas,
              local: os.mt_local,
              ambiente: os.mt_ambiente
            }
          : null
      };
    });
  res.json({ ordens, hoje: hojeLocal() });
});

module.exports = router;