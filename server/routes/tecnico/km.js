const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico, equipesDoUsuario } = require('../../calendario');

const router = express.Router();

router.use(authenticate, requireRole('tecnico', 'gestor', 'admin'));

function podeGerenciarKm(usuario) {
  return usuario.perfil === 'gestor' || usuario.perfil === 'admin';
}

function ultimoKmVeiculo(veiculoId) {
  const r = db
    .prepare("SELECT km_final FROM registros_km WHERE veiculo_id = ? AND status = 'finalizado' AND km_final IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get(veiculoId);
  return r ? r.km_final : null;
}

function registroCompleto(id) {
  return db
    .prepare(
      `SELECT r.*, e.nome AS equipe_nome, v.placa AS veiculo_placa, v.descricao AS veiculo_descricao,
        COALESCE(u.nome, r.motorista_nome) AS motorista_nome, u2.nome AS iniciado_por_nome, u3.nome AS finalizado_por_nome,
        o.numero AS os_numero
       FROM registros_km r
       LEFT JOIN equipes e ON e.id = r.equipe_id
       LEFT JOIN veiculos v ON v.id = r.veiculo_id
       LEFT JOIN usuarios u ON u.id = r.motorista_id
       LEFT JOIN usuarios u2 ON u2.id = r.iniciado_por
       LEFT JOIN usuarios u3 ON u3.id = r.finalizado_por
       LEFT JOIN ordens_servico o ON o.id = r.os_id
       WHERE r.id = ?`
    )
    .get(id);
}

router.get('/km/ultimo', (req, res) => {
  const veiculoId = Number(req.query.veiculo_id);
  if (!veiculoId) return res.status(400).json({ error: 'Informe o veículo' });
  res.json({ km: ultimoKmVeiculo(veiculoId) });
});

router.get('/km', (req, res) => {
  const equipeIds = equipesDoUsuario(req.user.id);
  const tecnico = req.user.perfil === 'tecnico';
  const { data, status } = req.query;

  let sql = `SELECT r.*, e.nome AS equipe_nome, v.placa AS veiculo_placa, v.descricao AS veiculo_descricao,
      COALESCE(u.nome, r.motorista_nome) AS motorista_nome, o.numero AS os_numero
    FROM registros_km r
    LEFT JOIN equipes e ON e.id = r.equipe_id
    LEFT JOIN veiculos v ON v.id = r.veiculo_id
    LEFT JOIN usuarios u ON u.id = r.motorista_id
    LEFT JOIN ordens_servico o ON o.id = r.os_id
    WHERE 1 = 1`;
  const params = [];
  if (tecnico) {
    sql += ` AND r.equipe_id IN (${equipeIds.map(() => '?').join(',')})`;
    params.push(...equipeIds);
  }
  if (data) {
    sql += ' AND r.data = ?';
    params.push(data);
  }
  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.id DESC';
  const registros = db.prepare(sql).all(...params);

  const base = tecnico ? `WHERE equipe_id IN (${equipeIds.map(() => '?').join(',')})` : 'WHERE 1 = 1';
  const baseParams = tecnico ? equipeIds : [];
  const totalDia = db
    .prepare(`SELECT COALESCE(SUM(km_percorrido), 0) AS total FROM registros_km ${base} AND data = date('now') AND status = 'finalizado'`)
    .get(...baseParams).total;

  const veiculos = db.prepare("SELECT id, placa, descricao FROM veiculos WHERE ativo = 1 ORDER BY placa").all();
  if (tecnico && equipeIds.length === 0) {
    return res.json({ registros: [], total_dia: 0, veiculos, equipes: [], membros: [], ordens: [] });
  }
  const equipes = tecnico
    ? db.prepare(`SELECT id, nome FROM equipes WHERE id IN (${equipeIds.map(() => '?').join(',')}) ORDER BY nome`).all(...equipeIds)
    : db.prepare('SELECT id, nome FROM equipes ORDER BY nome').all();
  const membros = db
    .prepare(
      `SELECT DISTINCT u.id, u.nome, u.perfil FROM usuarios u
       WHERE u.ativo = 1 AND (${tecnico ? `u.equipe_id IN (${equipeIds.map(() => '?').join(',')}) OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id IN (${equipeIds.map(() => '?').join(',')}))` : "u.equipe_id IS NOT NULL OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id)"})
       ORDER BY u.nome`
    )
    .all(...(tecnico ? [...equipeIds, ...equipeIds] : []));
  const ordens = tecnico
    ? db
        .prepare(`SELECT id, numero, servico FROM ordens_servico WHERE equipe_id IN (${equipeIds.map(() => '?').join(',')}) AND status NOT IN ('cancelada', 'concluida', 'excluida') ORDER BY numero`)
        .all(...equipeIds)
    : [];

  res.json({ registros, total_dia: totalDia, veiculos, equipes, membros, ordens });
});

router.post('/km', (req, res) => {
  const { equipe_id, veiculo_id, motorista_id, motorista_nome, os_id, km_inicial, local_inicial } = req.body || {};
  const equipe = db.prepare('SELECT id, nome FROM equipes WHERE id = ?').get(Number(equipe_id));
  if (!equipe) return res.status(400).json({ error: 'Equipe é obrigatória e deve existir' });
  if (req.user.perfil === 'tecnico' && !equipesDoUsuario(req.user.id).includes(equipe.id)) {
    return res.status(403).json({ error: 'Você só pode iniciar registros para as suas equipes' });
  }
  const veiculo = db.prepare('SELECT id, placa, ativo FROM veiculos WHERE id = ?').get(Number(veiculo_id));
  if (!veiculo || veiculo.ativo !== 1) return res.status(400).json({ error: 'Veículo é obrigatório e deve estar ativo' });
  let motorista = null;
  if (motorista_id != null && motorista_id !== '') {
    motorista = db.prepare('SELECT id, nome, perfil, ativo FROM usuarios WHERE id = ?').get(Number(motorista_id));
    if (!motorista || motorista.ativo !== 1) return res.status(400).json({ error: 'Motorista é obrigatório' });
    if (!equipesDoUsuario(motorista.id).includes(equipe.id)) {
      return res.status(400).json({ error: 'O motorista deve estar vinculado à equipe do registro' });
    }
  }
  const motoristaNome = motorista ? motorista.nome : String(motorista_nome || '').trim();
  if (!motoristaNome) return res.status(400).json({ error: 'Motorista é obrigatório' });
  const kmInicial = Number(km_inicial);
  if (!Number.isInteger(kmInicial) || kmInicial < 0) {
    return res.status(400).json({ error: 'KM inicial deve ser um número inteiro válido' });
  }
  const localInicial = String(local_inicial || '').trim();
  if (!localInicial) return res.status(400).json({ error: 'Local inicial é obrigatório' });
  if (os_id != null && os_id !== '') {
    const os = db.prepare('SELECT id FROM ordens_servico WHERE id = ?').get(Number(os_id));
    if (!os) return res.status(400).json({ error: 'Ordem de serviço vinculada não encontrada' });
  }

  const emUso = db.prepare("SELECT id FROM registros_km WHERE veiculo_id = ? AND status = 'em_utilizacao'").get(veiculo.id);
  if (emUso) {
    return res.status(409).json({ error: 'Já existe um registro em utilização para este veículo' });
  }

  const ultimo = ultimoKmVeiculo(veiculo.id);
  if (ultimo != null && kmInicial < ultimo && !podeGerenciarKm(req.user)) {
    return res.status(400).json({ error: `KM inicial não pode ser menor que o último KM conhecido do veículo (${ultimo}). Ajuste com permissão do Gestor.` });
  }

  const info = db
    .prepare(
      `INSERT INTO registros_km (equipe_id, veiculo_id, motorista_id, motorista_nome, os_id, data, data_hora_inicio, km_inicial, local_inicial, status, iniciado_por)
       VALUES (?, ?, ?, ?, ?, date('now'), datetime('now'), ?, ?, 'em_utilizacao', ?)`
    )
    .run(equipe.id, veiculo.id, motorista ? motorista.id : null, motorista ? null : motoristaNome, os_id != null && os_id !== '' ? Number(os_id) : null, kmInicial, localInicial, req.user.id);

  registrarHistorico({ usuario: req.user, tipo: 'km', registroId: info.lastInsertRowid, campo: 'inicio', valorNovo: `${veiculo.placa} | KM ${kmInicial} | ${localInicial}` });
  res.status(201).json({ registro: registroCompleto(info.lastInsertRowid) });
});

router.post('/km/:id/finalizar', (req, res) => {
  const id = Number(req.params.id);
  const registro = db.prepare('SELECT * FROM registros_km WHERE id = ?').get(id);
  if (!registro) return res.status(404).json({ error: 'Registro de quilometragem não encontrado' });
  if (registro.status !== 'em_utilizacao') {
    return res.status(400).json({ error: 'Registro já finalizado' });
  }
  if (req.user.perfil === 'tecnico' && !equipesDoUsuario(req.user.id).includes(registro.equipe_id)) {
    return res.status(403).json({ error: 'Registro de outra equipe' });
  }
  const { km_final, local_final } = req.body || {};
  const kmFinal = Number(km_final);
  if (!Number.isInteger(kmFinal) || kmFinal < 0) {
    return res.status(400).json({ error: 'KM final deve ser um número inteiro válido' });
  }
  if (kmFinal < registro.km_inicial) {
    return res.status(400).json({ error: 'KM final não pode ser menor que o KM inicial' });
  }
  const localFinal = String(local_final || '').trim();
  if (!localFinal) return res.status(400).json({ error: 'Local final é obrigatório no encerramento' });
  const kmPercorrido = kmFinal - registro.km_inicial;

  db.prepare(
    `UPDATE registros_km SET km_final = ?, local_final = ?, km_percorrido = ?,
       data_hora_fim = datetime('now'), status = 'finalizado', finalizado_por = ?
     WHERE id = ?`
  ).run(kmFinal, localFinal, kmPercorrido, req.user.id, id);

  registrarHistorico({ usuario: req.user, tipo: 'km', registroId: id, campo: 'finalizacao', valorAnterior: 'em_utilizacao', valorNovo: `finalizado | ${kmPercorrido} km` });
  res.json({ registro: registroCompleto(id) });
});

module.exports = router;