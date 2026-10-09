const fs = require('fs');

const CAMINHO_ARQUIVO_PADRAO = require('path').join(__dirname, '..', 'Cliente (1).csv');

const MAPEAMENTO = [
  { coluna: 'Nome', campo: 'cliente.nome', descricao: 'Nome do cliente' },
  { coluna: 'CNPJ', campo: 'cliente.documento', descricao: 'Documento único (CNPJ)' },
  { coluna: 'CPF', campo: 'cliente.documento', descricao: 'Documento único (CPF), usado quando não há CNPJ' },
  { coluna: 'Email principal', campo: 'cliente.email', descricao: 'E-mail do cliente' },
  { coluna: 'Telefone principal', campo: 'cliente.telefone', descricao: 'Telefone do cliente' },
  { coluna: 'Endereço', campo: 'local.endereco', descricao: 'Rua do local de atendimento' },
  { coluna: 'Número', campo: 'local.endereco', descricao: 'Número do endereço' },
  { coluna: 'Bairro', campo: 'local.endereco', descricao: 'Bairro do local' },
  { coluna: 'Complemento', campo: 'local.endereco', descricao: 'Complemento do endereço' },
  { coluna: 'Cidade', campo: 'local.cidade', descricao: 'Cidade do local' },
  { coluna: 'Estado', campo: 'local.estado', descricao: 'UF do local' },
  { coluna: 'CEP', campo: 'local.cep', descricao: 'CEP do local' },
  { coluna: 'Nome Contato', campo: 'local.responsavel_nome', descricao: 'Responsável pelo local' },
  { coluna: 'E-mail Contato', campo: 'local.responsavel_email', descricao: 'E-mail do responsável' }
];

const COLUNAS_SEM_CAMPO_FIXAS = [
  'Razão Social',
  'ID Estrangeiro',
  'DataCriacao',
  'Observações',
  'Status',
  'Código',
  'Inscrição Estadual',
  'Data fundação/Aniversário'
];

function parseCsv(texto) {
  const registros = [];
  let campo = '';
  let registro = [];
  let emAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (emAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"' && campo === '') {
      emAspas = true;
    } else if (ch === ';') {
      registro.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      registro.push(campo);
      campo = '';
      if (!(registro.length === 1 && registro[0] === '')) registros.push(registro);
      registro = [];
    } else {
      campo += ch;
    }
  }
  registro.push(campo);
  if (!(registro.length === 1 && registro[0] === '')) registros.push(registro);

  if (registros.length === 0) return [];
  const cabecalhos = registros.shift().map((h) => String(h).trim());
  return registros.map((r) => {
    const obj = {};
    cabecalhos.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
    });
    return obj;
  });
}

function normalizarDocumento(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos.length > 0 ? digitos : null;
}

function tipoDocumento(digitos) {
  if (digitos === null) return null;
  if (digitos.length === 14) return 'CNPJ';
  if (digitos.length === 11) return 'CPF';
  return null;
}

function juntarPartes(partes) {
  return partes
    .map((p) => String(p ?? '').trim().replace(/[,;\s]+$/, '').trim())
    .filter(Boolean)
    .join(', ');
}

function limparContato(nomeContato) {
  const t = String(nomeContato ?? '').trim();
  if (!t) return { nome: null };
  const digitos = t.replace(/\D/g, '');
  if (digitos.length >= 10) return { nome: null };
  if (t.replace(/[^a-zA-ZÀ-ÿ]/g, '').length <= 2) return { nome: null };
  if (t.includes('@')) return { nome: null, email: t };
  return { nome: t };
}

function extrairDados(linha) {
  const cnpj = normalizarDocumento(linha['CNPJ']);
  const cpf = normalizarDocumento(linha['CPF']);
  const documento = cnpj || cpf;
  const tipoDoc = cnpj ? 'CNPJ' : cpf ? 'CPF' : null;
  const endereco = juntarPartes([linha['Endereço'], linha['Número'], linha['Bairro'], linha['Complemento']]);
  const contato = limparContato(linha['Nome Contato']);
  return {
    nome: String(linha['Nome'] ?? '').trim(),
    documento,
    tipo_documento: tipoDoc,
    documento_original: (cnpj ? linha['CNPJ'] : linha['CPF']) || '',
    email: String(linha['Email principal'] ?? '').trim() || null,
    telefone: String(linha['Telefone principal'] ?? '').trim() || null,
    endereco,
    cidade: String(linha['Cidade'] ?? '').trim() || null,
    estado: String(linha['Estado'] ?? '').trim() || null,
    cep: String(linha['CEP'] ?? '').trim() || null,
    responsavel_nome: contato.nome,
    responsavel_email: contato.email || String(linha['E-mail Contato'] ?? '').trim() || null
  };
}

function nivelCompletude(dados) {
  const campos = [
    dados.nome, dados.documento, dados.email, dados.telefone, dados.endereco,
    dados.cidade, dados.estado, dados.cep, dados.responsavel_nome, dados.responsavel_email
  ];
  return campos.filter((v) => v != null && String(v).trim() !== '').length;
}

function analisarImportacao(linhas, clientesExistentes) {
  const porDocumento = new Map(
    clientesExistentes
      .filter((c) => c.documento)
      .map((c) => [normalizarDocumento(c.documento), c])
  );

  const itens = [];
  const indicePorDoc = new Map();

  for (let i = 0; i < linhas.length; i++) {
    const dados = extrairDados(linhas[i]);

    if (!dados.nome) {
      itens.push({ linha: i + 2, acao: 'erro', motivo: 'Linha sem nome do cliente', dados });
      continue;
    }
    if (!dados.documento) {
      itens.push({ linha: i + 2, acao: 'erro', motivo: 'Linha sem CPF/CNPJ — impossível garantir unicidade', dados });
      continue;
    }
    if (!tipoDocumento(dados.documento)) {
      itens.push({
        linha: i + 2,
        acao: 'erro',
        motivo: `Documento com formato inválido (${dados.tipo_documento ?? dados.documento.length} dígitos)`,
        dados
      });
      continue;
    }

    const indiceAnterior = indicePorDoc.get(dados.documento);
    if (indiceAnterior !== undefined) {
      const anterior = itens[indiceAnterior];
      if (nivelCompletude(dados) > nivelCompletude(anterior.dados)) {
        itens[indiceAnterior] = {
          linha: anterior.linha,
          acao: 'duplicado_arquivo',
          motivo: `Substituído pela linha ${i + 2}, que possui mais informações preenchidas`,
          dados: anterior.dados
        };
        indicePorDoc.set(dados.documento, itens.length);
        itens.push({ linha: i + 2, acao: 'novo', motivo: '', dados });
      } else {
        itens.push({
          linha: i + 2,
          acao: 'duplicado_arquivo',
          motivo: `Duplicado no arquivo (documento já presente na linha ${anterior.linha}); mantida a mais completa`,
          dados
        });
      }
      continue;
    }

    const existente = porDocumento.get(dados.documento);
    if (existente) {
      const avisos = [];
      if (existente.email && dados.email && existente.email.trim().toLowerCase() !== dados.email.toLowerCase()) {
        avisos.push(`e-mail divergente do cadastrado (${existente.email})`);
      }
      itens.push({
        linha: i + 2,
        acao: 'ja_existente',
        motivo: `Já existe cliente #${existente.id} (${existente.nome}) com este documento${avisos.length ? ' — ' + avisos.join('; ') : ''}`,
        dados
      });
      continue;
    }

    indicePorDoc.set(dados.documento, itens.length);
    itens.push({ linha: i + 2, acao: 'novo', motivo: '', dados });
  }

  const contar = (acao) => itens.filter((x) => x.acao === acao).length;
  return {
    itens,
    resumo: {
      total_linhas: linhas.length,
      novos: contar('novo'),
      duplicados_arquivo: contar('duplicado_arquivo'),
      ja_existentes: contar('ja_existente'),
      erros: contar('erro')
    }
  };
}

function lerLinhasDoArquivo(caminho = CAMINHO_ARQUIVO_PADRAO) {
  const texto = fs.readFileSync(caminho, 'utf8');
  return parseCsv(texto);
}

function colunasSemCampo(linhas) {
  const presentes = new Set();
  for (const l of linhas.slice(0, 50)) {
    Object.keys(l).forEach((k) => presentes.add(k));
  }
  return COLUNAS_SEM_CAMPO_FIXAS.filter((c) => presentes.has(c));
}

module.exports = {
  MAPEAMENTO,
  CAMINHO_ARQUIVO_PADRAO,
  parseCsv,
  normalizarDocumento,
  tipoDocumento,
  limparContato,
  extrairDados,
  nivelCompletude,
  analisarImportacao,
  lerLinhasDoArquivo,
  colunasSemCampo
};
