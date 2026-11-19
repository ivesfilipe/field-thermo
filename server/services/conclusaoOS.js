const crypto = require('crypto');
const db = require('../db');
const { TIPOS_NECESSIDADE } = require('../constantes');
const { registrarHistorico } = require('../calendario');

function novoToken() {
  return crypto.randomBytes(16).toString('hex');
}

function concluirOS({ osId, usuario = null, relatorioIa = null, recomendacoes = null, forcarEnvioComercial = false } = {}) {
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(osId);
  if (!os) {
    throw new Error('Ordem de serviço não encontrada');
  }
  if (!['em_andamento', 'aguardando_validacao'].includes(os.status)) {
    throw new Error('Somente OS em andamento ou aguardando validação pode ser concluída');
  }
  const execucao = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(osId);
  if (!execucao) {
    throw new Error('OS sem execução registrada');
  }

  const conteudo = relatorioIa != null ? JSON.stringify(relatorioIa) : null;
  const relatorioExistente = db.prepare('SELECT id FROM relatorios WHERE os_id = ?').get(osId);
  if (relatorioExistente) {
    if (conteudo != null) {
      db.prepare(
        `UPDATE relatorios SET status = 'aprovado', validado_por = NULL, data_validacao = datetime('now'),
           recomendacoes = ?, complemento_motivo = NULL, conteudo = ?, token = COALESCE(token, ?)
         WHERE os_id = ?`
      ).run(recomendacoes ?? null, conteudo, novoToken(), osId);
    } else {
      db.prepare(
        `UPDATE relatorios SET status = 'aprovado', validado_por = NULL, data_validacao = datetime('now'),
           recomendacoes = ?, complemento_motivo = NULL, token = COALESCE(token, ?)
         WHERE os_id = ?`
      ).run(recomendacoes ?? null, novoToken(), osId);
    }
  } else {
    db.prepare(
      `INSERT INTO relatorios (os_id, status, data_validacao, recomendacoes, conteudo, token)
       VALUES (?, 'aprovado', datetime('now'), ?, ?, ?)`
    ).run(osId, recomendacoes ?? null, conteudo, novoToken());
  }

  const relatorio = db.prepare('SELECT * FROM relatorios WHERE os_id = ?').get(osId);
  const tipoNecessidade =
    execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao'
      ? execucao.necessidade_adicional
      : null;
  const temOportunidade = forcarEnvioComercial || !!tipoNecessidade;

  if (temOportunidade) {
    db.prepare(
      "UPDATE relatorios SET enviado_comercial = 1, enviado_comercial_em = datetime('now') WHERE id = ?"
    ).run(relatorio.id);
    const jaExiste = db.prepare('SELECT id FROM oportunidades WHERE relatorio_id = ?').get(relatorio.id);
    if (!jaExiste) {
      const tipoOportunidade = tipoNecessidade || 'outro_servico';
      const descricao = [
        os.servico,
        TIPOS_NECESSIDADE[tipoOportunidade],
        recomendacoes ? `Recomendações: ${recomendacoes}` : null
      ].filter(Boolean).join(' — ');
      const info = db.prepare(
        'INSERT INTO oportunidades (relatorio_id, tipo, descricao, status, criado_por) VALUES (?, ?, ?, ?, ?)'
      ).run(relatorio.id, tipoOportunidade, descricao, 'novo', usuario ? usuario.id : null);
      registrarHistorico({
        usuario,
        tipo: 'oportunidade',
        registroId: info.lastInsertRowid,
        campo: 'criacao_automatica',
        valorNovo: descricao
      });
    }
    registrarHistorico({
      usuario,
      tipo: 'relatorio',
      registroId: relatorio.id,
      campo: 'envio_comercial',
      valorNovo: 'relatório liberado automaticamente ao comercial'
    });
  } else {
    db.prepare('UPDATE relatorios SET enviado_comercial = 0, enviado_comercial_em = NULL WHERE id = ?').run(
      relatorio.id
    );
  }

  db.prepare("UPDATE ordens_servico SET status = 'concluida' WHERE id = ?").run(osId);

  const avaliacaoExistente = db.prepare('SELECT id FROM avaliacoes WHERE os_id = ?').get(osId);
  if (!avaliacaoExistente) {
    db.prepare('INSERT INTO avaliacoes (os_id, token) VALUES (?, ?)').run(osId, novoToken());
    registrarHistorico({
      usuario,
      tipo: 'os',
      registroId: osId,
      campo: 'avaliacao',
      valorNovo: 'avaliação de cliente liberada'
    });
  }

  registrarHistorico({
    usuario,
    tipo: 'relatorio',
    registroId: relatorio.id,
    campo: 'liberacao',
    valorAnterior: 'pendente',
    valorNovo: 'aprovado automaticamente na conclusão'
  });
  registrarHistorico({
    usuario,
    tipo: 'os',
    registroId: osId,
    campo: 'status',
    valorAnterior: os.status,
    valorNovo: 'concluida'
  });

  return {
    osId,
    relatorioId: relatorio.id,
    enviadoComercial: temOportunidade,
    avaliacaoCriada: !avaliacaoExistente
  };
}

function concluirOSLegadas() {
  const legadas = db.prepare("SELECT id FROM ordens_servico WHERE status = 'aguardando_validacao'").all();
  let concluidas = 0;
  for (const legada of legadas) {
    const execucao = db.prepare('SELECT relatorio_ia FROM execucoes WHERE os_id = ?').get(legada.id);
    let relatorioIa = null;
    if (execucao && execucao.relatorio_ia) {
      try {
        relatorioIa = JSON.parse(execucao.relatorio_ia);
      } catch {
        relatorioIa = null;
      }
    }
    try {
      concluirOS({ osId: legada.id, relatorioIa });
      concluidas += 1;
    } catch (err) {
      console.error(`Falha ao concluir OS legada ${legada.id}: ${err.message}`);
    }
  }
  return concluidas;
}

module.exports = { concluirOS, concluirOSLegadas };
