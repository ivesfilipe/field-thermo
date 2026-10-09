const express = require('express');
const db = require('../../db');

const router = express.Router();

const AVALIACAO_BASE = `
  SELECT a.id, a.os_id, a.token, a.status, a.nota, a.resolveu_necessidade, a.comentario,
    a.respondida_em, a.criado_em,
    o.numero AS os_numero, o.servico, o.descricao, o.data_agendada,
    c.nome AS cliente_nome, eq.nome AS equipe_nome
  FROM avaliacoes a
  JOIN ordens_servico o ON o.id = a.os_id
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN equipes eq ON eq.id = o.equipe_id
`;

function formatar(avaliacao) {
  return {
    status: avaliacao.status,
    os: {
      numero: avaliacao.os_numero,
      servico: avaliacao.servico,
      descricao: avaliacao.descricao,
      data_agendada: avaliacao.data_agendada,
      cliente_nome: avaliacao.cliente_nome,
      equipe_nome: avaliacao.equipe_nome
    },
    resposta: avaliacao.status === 'respondida'
      ? {
          nota: avaliacao.nota,
          resolveu_necessidade: avaliacao.resolveu_necessidade,
          comentario: avaliacao.comentario,
          respondida_em: avaliacao.respondida_em
        }
      : null
  };
}

router.get('/:token', (req, res) => {
  const avaliacao = db.prepare(`${AVALIACAO_BASE} WHERE a.token = ?`).get(req.params.token);
  if (!avaliacao) {
    return res.status(404).json({ error: 'Link de avaliação não encontrado' });
  }
  res.json({ avaliacao: formatar(avaliacao) });
});

router.post('/:token', (req, res) => {
  const avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE token = ?').get(req.params.token);
  if (!avaliacao) {
    return res.status(404).json({ error: 'Link de avaliação não encontrado' });
  }
  if (avaliacao.status !== 'pendente') {
    return res.status(400).json({ error: 'Avaliação já respondida' });
  }
  const { nota, resolveu_necessidade, comentario } = req.body || {};
  const notaNum = Number(nota);
  if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
    return res.status(400).json({ error: 'Informe uma nota de 1 a 5 estrelas' });
  }
  if (!['sim', 'parcialmente', 'nao'].includes(resolveu_necessidade)) {
    return res.status(400).json({ error: 'Informe se o serviço resolveu a necessidade (sim, parcialmente ou não)' });
  }
  const comentarioTexto = comentario != null ? String(comentario).trim().slice(0, 2000) : null;
  db.prepare(
    `UPDATE avaliacoes SET status = 'respondida', nota = ?, resolveu_necessidade = ?,
       comentario = ?, respondida_em = datetime('now')
     WHERE id = ?`
  ).run(notaNum, resolveu_necessidade, comentarioTexto || null, avaliacao.id);
  res.json({ avaliacao: formatar(db.prepare(`${AVALIACAO_BASE} WHERE a.id = ?`).get(avaliacao.id)) });
});

module.exports = router;