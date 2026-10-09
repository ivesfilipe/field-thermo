const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico } = require('../../calendario');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const RAIO_TERRA_KM = 6371;
const DISTANCIA_AGRUPAMENTO_KM = 20;
const VELOCIDADE_MEDIA_KMH = 40;

function haversineKm(latA, lngA, latB, lngB) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(latB - latA);
  const dLng = rad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(a));
}

function carregarOs(ids) {
  const unicos = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (unicos.length === 0) return [];
  const lugares = unicos.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT o.id, o.numero, o.servico, o.prioridade, o.status, o.confirmada,
        o.tipo_atendimento, o.data_agendada, o.hora_inicio, o.hora_fim,
        o.cliente_id, c.nome AS cliente_nome,
        o.local_id, l.nome AS local_nome, l.endereco, l.cidade, l.estado, l.latitude, l.longitude,
        o.equipe_id, eq.nome AS equipe_nome,
        e.codigo_mt, e.patrimonio
       FROM ordens_servico o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN locais l ON l.id = o.local_id
       LEFT JOIN equipes eq ON eq.id = o.equipe_id
       LEFT JOIN equipamentos e ON e.id = o.equipamento_id
       WHERE o.id IN (${lugares}) AND o.status NOT IN ('cancelada', 'excluida')`
    )
    .all(...unicos);
}

function dadosPlanejamento(os) {
  return {
    id: os.id,
    numero: os.numero,
    servico: os.servico,
    prioridade: os.prioridade,
    status: os.status,
    tipo_atendimento: os.tipo_atendimento,
    data_agendada: os.data_agendada,
    hora_inicio: os.hora_inicio,
    hora_fim: os.hora_fim,
    cliente_id: os.cliente_id,
    cliente_nome: os.cliente_nome,
    local_id: os.local_id,
    local_nome: os.local_nome,
    endereco_completo: [os.endereco, os.cidade, os.estado].filter(Boolean).join(', '),
    cidade: os.cidade,
    estado: os.estado,
    latitude: os.latitude,
    longitude: os.longitude,
    tem_localizacao: os.latitude != null && os.longitude != null,
    equipe_id: os.equipe_id,
    equipe_nome: os.equipe_nome,
    mt: os.codigo_mt ? { codigo_mt: os.codigo_mt, patrimonio: os.patrimonio } : null
  };
}

router.post('/planejamento/grupos', (req, res) => {
  const { os_ids } = req.body || {};
  if (!Array.isArray(os_ids) || os_ids.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos uma OS' });
  }
  const ordens = carregarOs(os_ids).map(dadosPlanejamento);
  const comCoords = ordens.filter((o) => o.tem_localizacao);
  const semLocalizacao = ordens.filter((o) => !o.tem_localizacao);

  const grupos = [];
  const restantes = [...comCoords];
  let nGrupo = 0;
  while (restantes.length > 0) {
    const semente = restantes.shift();
    const membros = [semente];
    let centroid = { lat: semente.latitude, lng: semente.longitude };
    for (let i = restantes.length - 1; i >= 0; i--) {
      const outra = restantes[i];
      if (haversineKm(centroid.lat, centroid.lng, outra.latitude, outra.longitude) <= DISTANCIA_AGRUPAMENTO_KM) {
        membros.push(outra);
        restantes.splice(i, 1);
        const n = membros.length;
        centroid = {
          lat: (centroid.lat * (n - 1) + outra.latitude) / n,
          lng: (centroid.lng * (n - 1) + outra.longitude) / n
        };
      }
    }
    nGrupo += 1;
    const ref = membros[0];
    grupos.push({
      id: nGrupo,
      nome: `Grupo ${nGrupo}${ref.local_nome ? ` — ${ref.local_nome}` : ''}`,
      quantidade: membros.length,
      os: membros
    });
  }

  res.json({ grupos, sem_localizacao: semLocalizacao });
});

router.post('/planejamento/sequencia', (req, res) => {
  const { os_ids } = req.body || {};
  if (!Array.isArray(os_ids) || os_ids.length === 0) {
    return res.status(400).json({ error: 'Informe as OS do grupo' });
  }
  const ordens = carregarOs(os_ids).map(dadosPlanejamento);
  const comCoords = ordens.filter((o) => o.tem_localizacao);
  if (comCoords.length === 0) {
    return res.status(400).json({ error: 'Nenhuma OS do grupo possui localização para calcular o roteiro' });
  }

  const notas = [];

  const comHorario = comCoords
    .filter((o) => o.hora_inicio)
    .sort((a, b) => `${a.data_agendada || ''}${a.hora_inicio}`.localeCompare(`${b.data_agendada || ''}${b.hora_inicio}`));
  for (const o of comHorario) {
    notas.push(`OS ${o.numero} possui horário agendado (${o.hora_inicio}${o.data_agendada ? ` em ${o.data_agendada}` : ''}) — mantida na sequência respeitando a restrição`);
  }

  const urgentes = comCoords.filter((o) => o.prioridade === 'urgente' && !o.hora_inicio);
  for (const o of urgentes) {
    notas.push(`OS ${o.numero} é prioridade urgente — antecipada na sequência`);
  }

  const livres = comCoords.filter((o) => !o.hora_inicio && o.prioridade !== 'urgente');

  const sequencia = [...comHorario];

  const inserirProximo = () => {
    if (livres.length === 0) return false;
    let melhorIdx = -1;
    let melhorDist = Infinity;
    const origem = sequencia.length > 0 ? sequencia[sequencia.length - 1] : null;
    const alvo = urgentes.length > 0 ? urgentes[0] : null;
    for (let i = 0; i < livres.length; i++) {
      const o = livres[i];
      const d = origem
        ? haversineKm(origem.latitude, origem.longitude, o.latitude, o.longitude)
        : haversineKm(alvo.latitude, alvo.longitude, o.latitude, o.longitude);
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const escolhida = livres.splice(melhorIdx, 1)[0];
    if (alvo) {
      urgentes.shift();
      sequencia.push(alvo);
      notas.push(`OS ${alvo.numero} (urgente) posicionada antes de ${escolhida.numero} por prioridade`);
    }
    sequencia.push(escolhida);
    return true;
  };

  if (sequencia.length === 0 && urgentes.length > 0) {
    sequencia.push(urgentes.shift());
  }
  while (inserirProximo()) { /* insere as livres mantendo urgência */ }
  while (urgentes.length > 0) {
    sequencia.push(urgentes.shift());
    notas.push(`OS ${sequencia[sequencia.length - 1].numero} (urgente) sem horário incluída`);
  }

  const pontos = sequencia.map((o) => ({ latitude: o.latitude, longitude: o.longitude }));
  let totalKm = 0;
  if (pontos.length > 1) {
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i];
      const b = pontos[(i + 1) % pontos.length];
      totalKm += haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    }
  }
  const tempoHoras = Math.round((totalKm / VELOCIDADE_MEDIA_KMH) * 10) / 10;

  const comDistancia = sequencia.map((o, i) => {
    const anterior = i > 0 ? pontos[i - 1] : pontos[pontos.length - 1];
    const d = i > 0 ? haversineKm(anterior.latitude, anterior.longitude, o.latitude, o.longitude) : 0;
    return { ...o, distancia_anterior_km: Math.round(d * 10) / 10, posicao: i + 1 };
  });

  res.json({
    sequencia: comDistancia,
    total_km: Math.round(totalKm * 10) / 10,
    tempo_estimado_horas: tempoHoras,
    origem: 'Roteiro em circuito: retorna ao ponto de partida (Base)',
    notas,
    incluidas: sequencia.length
  });
});

router.post('/planejamento/localizacao', (req, res) => {
  const { os_id, latitude, longitude, endereco, cidade, estado, cep, nome_local } = req.body || {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Informe latitude e longitude válidas' });
  }
  const os = db
    .prepare("SELECT id, numero, cliente_id, local_id, status FROM ordens_servico WHERE id = ? AND status NOT IN ('cancelada', 'excluida')")
    .get(Number(os_id));
  if (!os) {
    return res.status(404).json({ error: 'OS não encontrada ou não editável' });
  }
  const salvar = db.transaction(() => {
    let localId = os.local_id;
    if (localId) {
      const campos = ['latitude = ?', 'longitude = ?'];
      const valores = [lat, lng];
      if (typeof endereco === 'string' && endereco.trim()) { campos.push('endereco = ?'); valores.push(endereco.trim()); }
      if (typeof cidade === 'string' && cidade.trim()) { campos.push('cidade = ?'); valores.push(cidade.trim()); }
      if (typeof estado === 'string' && estado.trim()) { campos.push('estado = ?'); valores.push(estado.trim()); }
      if (typeof cep === 'string' && cep.trim()) { campos.push('cep = ?'); valores.push(cep.trim()); }
      valores.push(localId);
      db.prepare(`UPDATE locais SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
    } else {
      const nome = typeof nome_local === 'string' && nome_local.trim() ? nome_local.trim() : `Local da OS ${os.numero}`;
      const inserir = db
        .prepare('INSERT INTO locais (cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          os.cliente_id,
          nome,
          typeof endereco === 'string' ? endereco.trim() : null,
          typeof cidade === 'string' ? cidade.trim() : null,
          typeof estado === 'string' ? estado.trim() : null,
          typeof cep === 'string' ? cep.trim() : null,
          lat,
          lng
        );
      localId = Number(inserir.lastInsertRowid);
      db.prepare('UPDATE ordens_servico SET local_id = ? WHERE id = ?').run(localId, os.id);
    }
    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: os.id,
      campo: 'localizacao',
      valorAnterior: '',
      valorNovo: `GPS ${lat.toFixed(6)}, ${lng.toFixed(6)} (definida no mapa)`
    });
    return localId;
  });
  const localId = salvar();
  res.json({ os_id: os.id, local_id: localId, latitude: lat, longitude: lng, tem_localizacao: true });
});

router.post('/planejamento/atribuir', (req, res) => {
  const { os_ids, equipe_id } = req.body || {};
  if (!Array.isArray(os_ids) || os_ids.length === 0) {
    return res.status(400).json({ error: 'Informe as OS do grupo' });
  }
  const equipe = db.prepare('SELECT id, nome FROM equipes WHERE id = ?').get(Number(equipe_id));
  if (!equipe) {
    return res.status(400).json({ error: 'Equipe é obrigatória e deve existir' });
  }
  const ordens = carregarOs(os_ids);
  if (ordens.length === 0) {
    return res.status(404).json({ error: 'Nenhuma OS encontrada para atribuição' });
  }
  const bloqueadas = [];
  let atribuidas = 0;
  const atribuir = db.transaction(() => {
    for (const os of ordens) {
      if (['concluida', 'cancelada', 'excluida', 'aguardando_validacao'].includes(os.status)) {
        bloqueadas.push({ id: os.id, numero: os.numero, status: os.status });
        continue;
      }
      db.prepare('UPDATE ordens_servico SET equipe_id = ?, confirmada = 1 WHERE id = ?').run(equipe.id, os.id);
      registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os.id, campo: 'equipe', valorAnterior: os.equipe_id ? String(os.equipe_id) : '', valorNovo: `Equipe ${equipe.nome} (planejamento)` });
      atribuidas += 1;
    }
  });
  atribuir();

  res.json({
    atribuidas,
    equipe: { id: equipe.id, nome: equipe.nome },
    bloqueadas,
    ordens: ordens.map(dadosPlanejamento)
  });
});

module.exports = router;