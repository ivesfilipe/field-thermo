const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico } = require('../../calendario');
const { TIPOS_NECESSIDADE, STATUS_OPORTUNIDADE, STATUS_OPORTUNIDADE_LABEL } = require('../../constantes');

const router = express.Router();

router.use(authenticate, requireRole('comercial'));

router.get('/oportunidades', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT op.id, op.tipo, op.descricao, op.valor_estimado, op.status,
      op.data_contato, op.resultado_contato, op.proposta_vinculada, op.previsao_fechamento,
      op.criado_em, oc.nome AS responsavel_nome,
      r.id AS relatorio_id, o.numero AS os_numero, c.nome AS cliente_nome
    FROM oportunidades op
    JOIN relatorios r ON r.id = op.relatorio_id
    JOIN ordens_servico o ON o.id = r.os_id
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios oc ON oc.id = op.responsavel_id
    WHERE 1 = 1`;
  const params = [];
  if (status) {
    sql += ' AND op.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY op.criado_em DESC';
  const oportunidades = db.prepare(sql).all(...params);
  for (const op of oportunidades) {
    op.tipo_label = TIPOS_NECESSIDADE[op.tipo] || op.tipo;
    op.status_label = STATUS_OPORTUNIDADE_LABEL[op.status] || op.status;
  }
  res.json({ oportunidades });
});

router.post('/oportunidades', (req, res) => {
  const { relatorio_id, descricao, valor_estimado, status, data_contato, resultado_contato, proposta_vinculada, previsao_fechamento } = req.body || {};
  if (!relatorio_id || !descricao) {
    return res.status(400).json({ error: 'Informe relatorio_id e descricao' });
  }
  const relatorio = db
    .prepare("SELECT id FROM relatorios WHERE id = ? AND status = 'aprovado' AND enviado_comercial = 1")
    .get(relatorio_id);
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório aprovado não encontrado' });
  }
  const existente = db.prepare('SELECT id FROM oportunidades WHERE relatorio_id = ?').get(relatorio_id);
  if (existente) {
    return res.status(409).json({ error: 'Este relatório já possui oportunidade registrada' });
  }
  if (status && !STATUS_OPORTUNIDADE.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const info = db
    .prepare(
      `INSERT INTO oportunidades (relatorio_id, tipo, descricao, valor_estimado, status,
         responsavel_id, data_contato, resultado_contato, proposta_vinculada, previsao_fechamento, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      relatorio_id, 'outro_servico', descricao, valor_estimado ?? null, status || 'novo',
      req.user.id, data_contato ?? null, resultado_contato ?? null, proposta_vinculada ?? null,
      previsao_fechamento ?? null, req.user.id
    );
  registrarHistorico({ usuario: req.user, tipo: 'oportunidade', registroId: info.lastInsertRowid, campo: 'criacao', valorNovo: descricao });
  res.status(201).json({ oportunidade: db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/oportunidades/:id', (req, res) => {
  const id = Number(req.params.id);
  const oportunidade = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(id);
  if (!oportunidade) {
    return res.status(404).json({ error: 'Oportunidade não encontrada' });
  }
  const {
    descricao, valor_estimado, status, data_contato, resultado_contato,
    proposta_vinculada, previsao_fechamento, responsavel_id
  } = req.body || {};
  if (status && !STATUS_OPORTUNIDADE.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const campos = {
    descricao: descricao !== undefined ? descricao : oportunidade.descricao,
    valor_estimado: valor_estimado !== undefined ? valor_estimado : oportunidade.valor_estimado,
    status: status !== undefined ? status : oportunidade.status,
    data_contato: data_contato !== undefined ? data_contato : oportunidade.data_contato,
    resultado_contato: resultado_contato !== undefined ? resultado_contato : oportunidade.resultado_contato,
    proposta_vinculada: proposta_vinculada !== undefined ? proposta_vinculada : oportunidade.proposta_vinculada,
    previsao_fechamento: previsao_fechamento !== undefined ? previsao_fechamento : oportunidade.previsao_fechamento,
    responsavel_id: responsavel_id !== undefined ? responsavel_id : oportunidade.responsavel_id
  };
  for (const campo of Object.keys(campos)) {
    if (String(campos[campo] ?? '') !== String(oportunidade[campo] ?? '')) {
      registrarHistorico({
        usuario: req.user, tipo: 'oportunidade', registroId: id, campo,
        valorAnterior: oportunidade[campo], valorNovo: campos[campo]
      });
    }
  }
  db.prepare(
    `UPDATE oportunidades SET descricao = ?, valor_estimado = ?, status = ?,
       data_contato = ?, resultado_contato = ?, proposta_vinculada = ?, previsao_fechamento = ?, responsavel_id = ?
     WHERE id = ?`
  ).run(campos.descricao, campos.valor_estimado, campos.status, campos.data_contato, campos.resultado_contato,
    campos.proposta_vinculada, campos.previsao_fechamento, campos.responsavel_id, id);
  res.json({ oportunidade: db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(id) });
});

router.delete('/oportunidades/:id', (req, res) => {
  const id = Number(req.params.id);
  const oportunidade = db.prepare('SELECT id FROM oportunidades WHERE id = ?').get(id);
  if (!oportunidade) {
    return res.status(404).json({ error: 'Oportunidade não encontrada' });
  }
  registrarHistorico({ usuario: req.user, tipo: 'oportunidade', registroId: id, campo: 'exclusao' });
  db.prepare('DELETE FROM oportunidades WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;