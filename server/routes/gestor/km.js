const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico, equipesDoUsuario } = require('../../calendario');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const BASE = `
  SELECT r.*, e.nome AS equipe_nome, v.placa AS veiculo_placa, v.descricao AS veiculo_descricao,
    COALESCE(u.nome, r.motorista_nome) AS motorista_nome, u2.nome AS iniciado_por_nome, u3.nome AS finalizado_por_nome,
    o.numero AS os_numero
  FROM registros_km r
  LEFT JOIN equipes e ON e.id = r.equipe_id
  LEFT JOIN veiculos v ON v.id = r.veiculo_id
  LEFT JOIN usuarios u ON u.id = r.motorista_id
  LEFT JOIN usuarios u2 ON u2.id = r.iniciado_por
  LEFT JOIN usuarios u3 ON u3.id = r.finalizado_por
  LEFT JOIN ordens_servico o ON o.id = r.os_id
`;

function aplicarFiltros(sql, params, q) {
  const { equipe_id, data, data_inicio, data_fim, veiculo_id, motorista_id, status } = q;
  if (equipe_id) {
    sql += ' AND r.equipe_id = ?';
    params.push(Number(equipe_id));
  }
  if (data) {
    sql += ' AND r.data = ?';
    params.push(data);
  } else {
    if (data_inicio) {
      sql += ' AND r.data >= ?';
      params.push(data_inicio);
    }
    if (data_fim) {
      sql += ' AND r.data <= ?';
      params.push(data_fim);
    }
  }
  if (veiculo_id) {
    sql += ' AND r.veiculo_id = ?';
    params.push(Number(veiculo_id));
  }
  if (motorista_id) {
    sql += ' AND r.motorista_id = ?';
    params.push(Number(motorista_id));
  }
  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  return sql;
}

router.get('/km', (req, res) => {
  let sql = `${BASE} WHERE 1 = 1`;
  const params = [];
  sql = aplicarFiltros(sql, params, req.query);
  sql += ' ORDER BY r.id DESC';
  const registros = db.prepare(sql).all(...params);

  let cond = 'WHERE 1 = 1';
  const condParams = [];
  cond = aplicarFiltros(cond, condParams, req.query);

  const ind = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN r.status = 'finalizado' THEN r.km_percorrido ELSE 0 END), 0) AS km_periodo,
        COUNT(*) AS registros,
        COUNT(DISTINCT r.veiculo_id) AS veiculos_utilizados,
        COUNT(DISTINCT CASE WHEN r.status = 'em_utilizacao' THEN r.veiculo_id END) AS veiculos_em_utilizacao
       FROM registros_km r ${cond}`
    )
    .get(...condParams);
  const kmDia = db
    .prepare(
      `SELECT COALESCE(SUM(km_percorrido), 0) AS km_dia FROM registros_km
       WHERE data = date('now') AND status = 'finalizado'`
    )
    .get().km_dia;

  const condJoin = cond === 'WHERE 1 = 1' ? '' : cond.replace('WHERE 1 = 1', '');
  const kmPorEquipe = db
    .prepare(
      `SELECT e.id AS equipe_id, e.nome AS equipe_nome,
        COALESCE(SUM(r.km_percorrido), 0) AS km_total,
        COUNT(r.id) AS registros
       FROM equipes e
       LEFT JOIN registros_km r ON r.equipe_id = e.id ${condJoin} AND r.status = 'finalizado'
       GROUP BY e.id, e.nome
       ORDER BY km_total DESC`
    )
    .all(...condParams);

  const veiculos = db.prepare('SELECT id, placa, descricao FROM veiculos ORDER BY placa').all();
  const membros = db
    .prepare(
      `SELECT DISTINCT u.id, u.nome FROM usuarios u
       WHERE u.ativo = 1 AND (u.equipe_id IS NOT NULL OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id))
       ORDER BY u.nome`
    )
    .all();

  res.json({
    registros,
    indicadores: {
      km_dia: kmDia,
      km_periodo: ind.km_periodo,
      registros: ind.registros,
      veiculos_utilizados: ind.veiculos_utilizados,
      veiculos_em_utilizacao: ind.veiculos_em_utilizacao
    },
    km_por_equipe: kmPorEquipe,
    veiculos,
    membros
  });
});

router.get('/km/:id', (req, res) => {
  const registro = db.prepare(`${BASE} WHERE r.id = ?`).get(Number(req.params.id));
  if (!registro) return res.status(404).json({ error: 'Registro de quilometragem não encontrado' });
  const historico = db
    .prepare("SELECT * FROM historico WHERE tipo = 'km' AND registro_id = ? ORDER BY id")
    .all(registro.id);
  res.json({ registro, historico });
});

router.patch('/km/:id', (req, res) => {
  const id = Number(req.params.id);
  const registro = db.prepare('SELECT * FROM registros_km WHERE id = ?').get(id);
  if (!registro) return res.status(404).json({ error: 'Registro de quilometragem não encontrado' });

  const { equipe_id, veiculo_id, motorista_id, motorista_nome, os_id, km_inicial, local_inicial } = req.body || {};
  const mudancas = [];

  let novaEquipe = registro.equipe_id;
  if (equipe_id != null && Number(equipe_id) !== registro.equipe_id) {
    const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(Number(equipe_id));
    if (!equipe) return res.status(400).json({ error: 'Equipe inválida' });
    novaEquipe = equipe.id;
    mudancas.push(['equipe', registro.equipe_id, novaEquipe]);
  }

  let novoVeiculo = registro.veiculo_id;
  if (veiculo_id != null && Number(veiculo_id) !== registro.veiculo_id) {
    const veiculo = db.prepare('SELECT id, ativo FROM veiculos WHERE id = ?').get(Number(veiculo_id));
    if (!veiculo || veiculo.ativo !== 1) return res.status(400).json({ error: 'Veículo inválido' });
    novoVeiculo = veiculo.id;
    mudancas.push(['veiculo', registro.veiculo_id, novoVeiculo]);
    if (registro.status === 'em_utilizacao') {
      const emUso = db.prepare("SELECT id FROM registros_km WHERE veiculo_id = ? AND status = 'em_utilizacao' AND id != ?").get(novoVeiculo, id);
      if (emUso) return res.status(409).json({ error: 'Já existe um registro em utilização para este veículo' });
    }
  }

  let novoMotorista = registro.motorista_id;
  let novoMotoristaNome = registro.motorista_nome || null;
  if (motorista_id != null && motorista_id !== '' && Number(motorista_id) !== registro.motorista_id) {
    const motorista = db.prepare('SELECT id, ativo FROM usuarios WHERE id = ?').get(Number(motorista_id));
    if (!motorista || motorista.ativo !== 1) return res.status(400).json({ error: 'Motorista inválido' });
    if (!equipesDoUsuario(motorista.id).includes(novaEquipe)) {
      return res.status(400).json({ error: 'O motorista deve estar vinculado à equipe do registro' });
    }
    novoMotorista = motorista.id;
    novoMotoristaNome = null;
    mudancas.push(['motorista', registro.motorista_nome || registro.motorista_id, novoMotorista]);
  } else if (motorista_nome !== undefined && String(motorista_nome).trim() !== (registro.motorista_nome || '')) {
    const nome = String(motorista_nome).trim();
    if (!nome) return res.status(400).json({ error: 'Motorista é obrigatório' });
    novoMotorista = null;
    novoMotoristaNome = nome;
    mudancas.push(['motorista', registro.motorista_nome || registro.motorista_id, nome]);
  }

  let novoKmInicial = registro.km_inicial;
  if (km_inicial != null && Number(km_inicial) !== registro.km_inicial) {
    const km = Number(km_inicial);
    if (!Number.isInteger(km) || km < 0) return res.status(400).json({ error: 'KM inicial inválido' });
    novoKmInicial = km;
    mudancas.push(['km_inicial', registro.km_inicial, novoKmInicial]);
  }

  let novoLocal = registro.local_inicial;
  if (local_inicial != null && String(local_inicial).trim() !== registro.local_inicial) {
    const local = String(local_inicial).trim();
    if (!local) return res.status(400).json({ error: 'Local inicial é obrigatório' });
    novoLocal = local;
    mudancas.push(['local_inicial', registro.local_inicial, novoLocal]);
  }

  let novoOs = registro.os_id;
  if (os_id !== undefined && (os_id === null || os_id === '' || Number(os_id) !== registro.os_id)) {
    const osVal = os_id === null || os_id === '' ? null : Number(os_id);
    if (osVal != null) {
      const os = db.prepare('SELECT id FROM ordens_servico WHERE id = ?').get(osVal);
      if (!os) return res.status(400).json({ error: 'Ordem de serviço vinculada não encontrada' });
    }
    novoOs = osVal;
    mudancas.push(['os', registro.os_id, novoOs]);
  }

  const kmPercorrido = registro.status === 'finalizado' && registro.km_final != null ? novoKmFinal(registro, novoKmInicial) : null;

  db.prepare(
    `UPDATE registros_km SET equipe_id = ?, veiculo_id = ?, motorista_id = ?, motorista_nome = ?, os_id = ?,
       km_inicial = ?, local_inicial = ?, km_percorrido = ?
     WHERE id = ?`
  ).run(novaEquipe, novoVeiculo, novoMotorista, novoMotoristaNome, novoOs, novoKmInicial, novoLocal, kmPercorrido, id);

  for (const [campo, anterior, novo] of mudancas) {
    registrarHistorico({ usuario: req.user, tipo: 'km', registroId: id, campo, valorAnterior: String(anterior ?? ''), valorNovo: String(novo ?? '') });
  }

  res.json({ registro: db.prepare(`${BASE} WHERE r.id = ?`).get(id) });
});

function novoKmFinal(registro, kmInicial) {
  if (kmInicial > registro.km_final) return null;
  return registro.km_final - kmInicial;
}

module.exports = router;