const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const importador = require('../../importar-clientes');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

router.get('/clientes', (req, res) => {
  const clientes = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM locais l WHERE l.cliente_id = c.id) AS total_locais,
        (SELECT COUNT(*) FROM equipamentos e WHERE e.cliente_id = c.id) AS total_equipamentos,
        (SELECT l.cidade FROM locais l WHERE l.cliente_id = c.id AND COALESCE(l.cidade,'') != '' ORDER BY l.id LIMIT 1) AS cidade_principal,
        (SELECT l.estado FROM locais l WHERE l.cliente_id = c.id AND COALESCE(l.estado,'') != '' ORDER BY l.id LIMIT 1) AS estado_principal,
        (SELECT l.responsavel_nome FROM locais l WHERE l.cliente_id = c.id AND COALESCE(l.responsavel_nome,'') != '' ORDER BY l.id LIMIT 1) AS responsavel_principal
       FROM clientes c ORDER BY c.nome`
    )
    .all();
  res.json({ clientes });
});

function analisarArquivo() {
  const linhas = importador.lerLinhasDoArquivo();
  const existentes = db.prepare('SELECT id, nome, documento, email FROM clientes').all();
  const analise = importador.analisarImportacao(linhas, existentes);
  return {
    mapeamento: importador.MAPEAMENTO,
    colunas_sem_campo: importador.colunasSemCampo(linhas),
    ...analise
  };
}

router.post('/clientes/importacao/preview', (req, res) => {
  try {
    res.json(analisarArquivo());
  } catch (e) {
    res.status(400).json({ error: `Não foi possível ler o arquivo de importação: ${e.message}` });
  }
});

router.post('/clientes/importacao/confirmar', (req, res) => {
  let analise;
  try {
    analise = analisarArquivo();
  } catch (e) {
    return res.status(400).json({ error: `Não foi possível ler o arquivo de importação: ${e.message}` });
  }
  const novos = analise.itens.filter((x) => x.acao === 'novo');
  if (novos.length === 0) {
    return res.json({
      importados: 0,
      ja_existentes: analise.resumo.ja_existentes,
      duplicados_arquivo: analise.resumo.duplicados_arquivo,
      erros: analise.resumo.erros,
      ids: []
    });
  }
  try {
    const ids = [];
    const inserirTudo = db.transaction(() => {
      for (const item of novos) {
        const d = item.dados;
        const info = db
          .prepare('INSERT INTO clientes (nome, documento, email, telefone, endereco) VALUES (?, ?, ?, ?, ?)')
          .run(d.nome, d.documento, d.email, d.telefone, d.endereco);
        const clienteId = Number(info.lastInsertRowid);
        ids.push(clienteId);
        const temLocal = d.endereco || d.cidade || d.estado || d.cep || d.responsavel_nome || d.responsavel_email;
        if (temLocal) {
          db.prepare(
            `INSERT INTO locais (cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude,
              responsavel_nome, responsavel_email, responsavel_telefone)
             VALUES (?, 'Principal', ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`
          ).run(clienteId, d.endereco || null, d.cidade, d.estado, d.cep, d.responsavel_nome, d.responsavel_email);
        }
        db.prepare(
          `INSERT INTO historico (usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo)
           VALUES (?, ?, 'os', ?, 'cliente', NULL, ?)`
        ).run(req.user.id, req.user.nome, clienteId, `Cliente importado da planilha (${d.tipo_documento} ${d.documento_original})`);
      }
    });
    inserirTudo();
    res.json({
      importados: ids.length,
      ja_existentes: analise.resumo.ja_existentes,
      duplicados_arquivo: analise.resumo.duplicados_arquivo,
      erros: analise.resumo.erros,
      ids
    });
  } catch (e) {
    res.status(500).json({ error: `Falha ao importar clientes: ${e.message}` });
  }
});

router.get('/clientes/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(Number(req.params.id));
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  const locais = db.prepare('SELECT * FROM locais WHERE cliente_id = ? ORDER BY nome').all(cliente.id);
  const equipamentos = db.prepare('SELECT * FROM equipamentos WHERE cliente_id = ? ORDER BY nome').all(cliente.id);
  res.json({ cliente, locais, equipamentos });
});

router.post('/clientes', (req, res) => {
  const { nome, documento, email, telefone, endereco, cidade, estado, cep, local_nome, responsavel_nome, responsavel_email, responsavel_telefone, latitude, longitude } = req.body || {};
  if (!nome) {
    return res.status(400).json({ error: 'Informe o nome do cliente' });
  }
  const criar = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO clientes (nome, documento, email, telefone, endereco) VALUES (?, ?, ?, ?, ?)')
      .run(nome, documento ?? null, email ?? null, telefone ?? null, endereco ?? null);
    const clienteId = Number(info.lastInsertRowid);
    let local = null;
    const temEndereco = endereco || cidade || estado || cep || responsavel_nome;
    if (temEndereco) {
      const localInfo = db
        .prepare(
          `INSERT INTO locais (cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude,
            responsavel_nome, responsavel_email, responsavel_telefone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clienteId,
          (local_nome && local_nome.trim()) || 'Principal',
          endereco ?? null,
          cidade ?? null,
          estado ?? null,
          cep ?? null,
          latitude != null && latitude !== '' ? Number(latitude) : null,
          longitude != null && longitude !== '' ? Number(longitude) : null,
          responsavel_nome ?? null,
          responsavel_email ?? null,
          responsavel_telefone ?? null
        );
      local = db.prepare('SELECT * FROM locais WHERE id = ?').get(Number(localInfo.lastInsertRowid));
    }
    return { cliente: db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId), local };
  });
  const { cliente, local } = criar();
  res.status(201).json({ cliente, local });
});

router.put('/clientes/:id', (req, res) => {
  const id = Number(req.params.id);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  const { nome, documento, email, telefone, endereco, responsavel_local } = req.body || {};
  db.prepare('UPDATE clientes SET nome = ?, documento = ?, email = ?, telefone = ?, endereco = ? WHERE id = ?').run(
    nome ?? cliente.nome,
    documento !== undefined ? documento : cliente.documento,
    email !== undefined ? email : cliente.email,
    telefone !== undefined ? telefone : cliente.telefone,
    endereco !== undefined ? endereco : cliente.endereco,
    id
  );
  if (responsavel_local !== undefined) {
    const primeiroLocal = db.prepare('SELECT id FROM locais WHERE cliente_id = ? ORDER BY id LIMIT 1').get(id);
    const nomeLimpo = String(responsavel_local || '').trim() || null;
    if (primeiroLocal) {
      db.prepare('UPDATE locais SET responsavel_nome = ? WHERE id = ?').run(nomeLimpo, primeiroLocal.id);
    } else if (nomeLimpo) {
      db.prepare("INSERT INTO locais (cliente_id, nome, responsavel_nome) VALUES (?, 'Principal', ?)").run(id, nomeLimpo);
    }
  }
  res.json({ cliente: db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) });
});

router.delete('/clientes/:id', (req, res) => {
  const id = Number(req.params.id);
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(id);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  const vinculadas = db.prepare('SELECT COUNT(*) AS n FROM ordens_servico WHERE cliente_id = ?').get(id).n;
  if (vinculadas > 0) {
    return res.status(400).json({ error: 'Cliente possui ordens de serviço vinculadas' });
  }
  db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
