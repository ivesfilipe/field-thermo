const db = require('./db');

const TIPOS_ATIVIDADE = {
  visita_tecnica: 'Visita técnica',
  levantamento: 'Levantamento',
  inspecao: 'Inspeção',
  reuniao: 'Reunião',
  retorno_cliente: 'Retorno ao cliente',
  preventiva: 'Preventiva programada',
  acompanhamento: 'Acompanhamento de serviço',
  outro: 'Outra atividade'
};

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusOsVisual(os) {
  if (os.status === 'cancelada') return 'cancelada';
  if (os.status === 'concluida') return 'concluida';
  if (os.status === 'aguardando_validacao') return 'aguardando_validacao';
  if (os.status === 'em_andamento') return 'em_andamento';
  if (os.confirmada) return 'confirmada';
  if (os.data_agendada && os.data_agendada < hojeLocal()) return 'atrasada';
  return 'agendada';
}

function statusAtividadeVisual(atv) {
  if (atv.status === 'cancelada' || atv.status === 'concluida') return atv.status;
  if (atv.data && atv.data < hojeLocal()) return 'atrasada';
  return atv.status;
}

const STATUS_VISUAL = ['agendada', 'confirmada', 'em_andamento', 'aguardando_validacao', 'concluida', 'reaberta', 'cancelada', 'atrasada'];

function horarioFimPadrao(horaInicio) {
  if (!horaInicio) return null;
  const [h, m] = horaInicio.split(':').map(Number);
  const fim = new Date(2000, 0, 1, h + 1, m || 0);
  return `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`;
}

function sobrepoe(iniA, fimA, iniB, fimB) {
  if (!iniA || !iniB) return false;
  const a = iniA.localeCompare(fimB) < 0;
  const b = iniB.localeCompare(fimA) < 0;
  return a && b;
}

function detectarConflitos({ data, hora_inicio, hora_fim, tecnico_id, equipe_id, excluir_os_id, excluir_atividade_id }) {
  if (!data) return [];
  const fim = hora_fim || horarioFimPadrao(hora_inicio);
  if (!hora_inicio || !fim) return [];
  const conflitos = [];

  const conflitoOs = (item) => {
    if (item.id === excluir_os_id) return;
    if (!item.hora_inicio) return;
    if (!sobrepoe(hora_inicio, fim, item.hora_inicio || '00:00', item.hora_fim || '23:59')) return;
    if (tecnico_id && item.tecnico_id === tecnico_id) {
      conflitos.push({
        tipo: 'os', id: item.id, referencia: item.numero, titulo: item.servico,
        motivo: 'tecnico', horario: `${item.data} ${item.hora_inicio || '--'}-${item.hora_fim || '--'}`,
        tecnico_nome: item.tecnico_nome
      });
    }
    if (equipe_id && item.equipe_id === equipe_id) {
      conflitos.push({
        tipo: 'os', id: item.id, referencia: item.numero, titulo: item.servico,
        motivo: 'equipe', horario: `${item.data} ${item.hora_inicio || '--'}-${item.hora_fim || '--'}`,
        equipe_nome: item.equipe_nome
      });
    }
  };

  const conflitoAtv = (item) => {
    if (item.id === excluir_atividade_id) return;
    if (item.status === 'cancelada' || item.status === 'concluida') return;
    if (!item.hora_inicio) return;
    if (!sobrepoe(hora_inicio, fim, item.hora_inicio || '00:00', item.hora_fim || '23:59')) return;
    if (tecnico_id && item.tecnico_id === tecnico_id) {
      conflitos.push({
        tipo: 'atividade', id: item.id, referencia: `Atividade #${item.id}`, titulo: item.titulo,
        motivo: 'tecnico', horario: `${item.data} ${item.hora_inicio || '--'}-${item.hora_fim || '--'}`,
        tecnico_nome: item.tecnico_nome
      });
    }
    if (equipe_id && item.equipe_id === equipe_id) {
      conflitos.push({
        tipo: 'atividade', id: item.id, referencia: `Atividade #${item.id}`, titulo: item.titulo,
        motivo: 'equipe', horario: `${item.data} ${item.hora_inicio || '--'}-${item.hora_fim || '--'}`,
        equipe_nome: item.equipe_nome
      });
    }
  };

  const osLista = db
    .prepare(
      `SELECT o.id, o.numero, o.servico, o.data_agendada AS data, o.hora_inicio, o.hora_fim,
        o.tecnico_id, o.equipe_id, t.nome AS tecnico_nome, eq.nome AS equipe_nome
       FROM ordens_servico o
       LEFT JOIN usuarios t ON t.id = o.tecnico_id
       LEFT JOIN equipes eq ON eq.id = o.equipe_id
       WHERE o.data_agendada = ? AND o.status NOT IN ('cancelada', 'excluida')`
    )
    .all(data);
  for (const item of osLista) conflitoOs(item);

  const atvLista = db
    .prepare(
      `SELECT a.id, a.titulo, a.data, a.hora_inicio, a.hora_fim, a.status,
        a.tecnico_id, a.equipe_id, t.nome AS tecnico_nome, eq.nome AS equipe_nome
       FROM atividades a
       LEFT JOIN usuarios t ON t.id = a.tecnico_id
       LEFT JOIN equipes eq ON eq.id = a.equipe_id
       WHERE a.data = ?`
    )
    .all(data);
  for (const item of atvLista) conflitoAtv(item);

  return conflitos;
}

function registrarHistorico({ usuario, tipo, registroId, campo, valorAnterior, valorNovo }) {
  db.prepare(
    `INSERT INTO historico (usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    usuario ? usuario.id : null,
    usuario ? usuario.nome : null,
    tipo,
    registroId,
    campo,
    valorAnterior !== undefined && valorAnterior !== null ? String(valorAnterior) : null,
    valorNovo !== undefined && valorNovo !== null ? String(valorNovo) : null
  );
}

function verificarConflitoEResponder(res, conflitos, ignorar) {
  if (conflitos.length === 0 || ignorar) {
    return false;
  }
  res.status(409).json({
    error: 'Conflito de agenda detectado',
    conflitos
  });
  return true;
}

function equipesDoUsuario(usuarioId) {
  const ids = db
    .prepare(
      `SELECT equipe_id FROM usuarios_equipes WHERE usuario_id = ?
       UNION
       SELECT equipe_id FROM usuarios WHERE id = ? AND equipe_id IS NOT NULL`
    )
    .all(usuarioId, usuarioId)
    .map((r) => r.equipe_id);
  return [...new Set(ids.filter((id) => id != null))];
}

function validarTecnicoDeAgenda(tecnico_id, equipe_id) {
  if (tecnico_id == null) return null;
  const tecnico = db.prepare('SELECT id, perfil, equipe_id FROM usuarios WHERE id = ?').get(tecnico_id);
  if (!tecnico || tecnico.perfil !== 'tecnico') {
    return 'Técnico inválido';
  }
  if (equipe_id != null && !equipesDoUsuario(tecnico_id).includes(equipe_id)) {
    return 'Técnico não pertence à equipe informada';
  }
  return null;
}

module.exports = {
  TIPOS_ATIVIDADE,
  STATUS_VISUAL,
  hojeLocal,
  statusOsVisual,
  statusAtividadeVisual,
  horarioFimPadrao,
  detectarConflitos,
  registrarHistorico,
  verificarConflitoEResponder,
  validarTecnicoDeAgenda,
  equipesDoUsuario
};
