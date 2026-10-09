const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'field20-test-' + Date.now());
process.env.DB_PATH = path.join(TEST_DIR, 'test.db');
process.env.UPLOADS_DIR = path.join(TEST_DIR, 'uploads');
process.env.JWT_SECRET = 'test_secret';
process.env.PORT = '0';

const app = require('../server/index');
require('../server/seed');

let server;
let base = '';
let passou = 0;
let falhou = 0;

async function api(route, method = 'GET', token, body) {
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function upload(route, token, field, filename, content) {
  const fd = new FormData();
  fd.append(field, new Blob([content], { type: 'image/png' }), filename);
  const res = await fetch(base + route, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function test(nome, condicao, detalhe = '') {
  if (condicao) {
    passou++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhou++;
    console.log(`  FAIL  ${nome} ${detalhe}`);
  }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
  console.log(`FIELD 2.0 - Suite de testes (banco temporário: ${TEST_DIR})\n`);

  let admin, gestor, tecnico, comercial;

  console.log('Fase 2 - Login e permissões');
  {
    const r1 = await api('/api/auth/login', 'POST', null, { email: 'admin@field.com', senha: 'admin123' });
    test('login admin', r1.status === 200 && r1.data.token, r1.status);
    admin = r1.data.token;
    const r2 = await api('/api/auth/login', 'POST', null, { email: 'gestor@field.com', senha: 'gestor123' });
    test('login gestor', r2.status === 200 && r2.data.token, r2.status);
    gestor = r2.data.token;
    const r3 = await api('/api/auth/login', 'POST', null, { email: 'tecnico@field.com', senha: 'tecnico123' });
    test('login tecnico', r3.status === 200 && r3.data.token, r3.status);
    tecnico = r3.data.token;
    const r4 = await api('/api/auth/login', 'POST', null, { email: 'comercial@field.com', senha: 'comercial123' });
    test('login comercial', r4.status === 200 && r4.data.token, r4.status);
    comercial = r4.data.token;
    const r5 = await api('/api/auth/login', 'POST', null, { email: 'gestor@field.com', senha: 'errada' });
    test('senha errada -> 401', r5.status === 401, r5.status);
    const r6 = await api('/api/auth/me');
    test('sem token -> 401', r6.status === 401, r6.status);
    const r7 = await api('/api/auth/me', 'GET', gestor);
    test('/me retorna perfil', r7.status === 200 && r7.data.usuario.perfil === 'gestor', r7.status);
  }

  console.log('Fase 3 - Administrador (usuarios e equipes)');
  {
    const r1 = await api('/api/admin/usuarios', 'GET', admin);
    test('lista usuarios', r1.status === 200 && r1.data.usuarios.length >= 4, r1.status);
    const r2 = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tecnico 2', email: 'tecnovo@field.com', senha: '123456', perfil: 'tecnico', equipe_id: 1 });
    test('cria usuario', r2.status === 201 && r2.data.usuario.email === 'tecnovo@field.com', r2.status);
    const r3 = await api('/api/admin/usuarios', 'POST', admin, { nome: 'X', email: 'tecnovo@field.com', senha: '1', perfil: 'tecnico' });
    test('email duplicado -> 409', r3.status === 409, r3.status);
    const r4 = await api('/api/admin/usuarios', 'POST', admin, { nome: 'X', email: 'x@x.com', senha: '1', perfil: 'hacker' });
    test('perfil invalido -> 400', r4.status === 400, r4.status);
    const r5 = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Sul', descricao: 'Regiao sul' });
    test('cria equipe', r5.status === 201, r5.status);
    const r6 = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Sul' });
    test('equipe duplicada -> 409', r6.status === 409, r6.status);
    const r7 = await api(`/api/admin/usuarios/${r2.data.usuario.id}/status`, 'PATCH', admin, { ativo: false });
    test('desativa usuario', r7.status === 200 && r7.data.usuario.ativo === 0, r7.status);
  }

  console.log('Fase 4 - Gestor (clientes, locais, equipamentos, OS, agenda)');
  let clienteId, localId, equipId, osId;
  {
    const r1 = await api('/api/gestor/clientes', 'POST', gestor, { nome: 'Cliente Teste', documento: '11.111.111/0001-11' });
    test('cria cliente', r1.status === 201, r1.status);
    clienteId = r1.data.cliente.id;
    const r2 = await api('/api/gestor/clientes', 'POST', gestor, {});
    test('cliente sem nome -> 400', r2.status === 400, r2.status);
    const cComEndereco = await api('/api/gestor/clientes', 'POST', gestor, {
      nome: 'Cliente com Endereço', endereco: 'Rua dos Ipês, 100', cidade: 'Contagem', estado: 'MG', cep: '32000-000',
      local_nome: 'Matriz', responsavel_nome: 'Ana Responsavel'
    });
    test('cliente já criado com o primeiro endereço', cComEndereco.status === 201 && !!cComEndereco.data.local && cComEndereco.data.local.cliente_id === cComEndereco.data.cliente.id && cComEndereco.data.local.endereco === 'Rua dos Ipês, 100' && cComEndereco.data.local.cidade === 'Contagem' && cComEndereco.data.local.nome === 'Matriz' && cComEndereco.data.local.responsavel_nome === 'Ana Responsavel', `${cComEndereco.status} ${JSON.stringify(cComEndereco.data.local)}`);
    const cSemEndereco = await api('/api/gestor/clientes', 'POST', gestor, { nome: 'Cliente Sem Endereco' });
    test('cliente sem endereço não cria local', cSemEndereco.status === 201 && cSemEndereco.data.local === null, `${cSemEndereco.status} ${JSON.stringify(cSemEndereco.data.local)}`);
    const listaComEnd = await api('/api/gestor/clientes', 'GET', gestor);
    const comEndNaLista = listaComEnd.data.clientes.find((c) => c.id === cComEndereco.data.cliente.id);
    test('endereço aparece na contagem do cliente', listaComEnd.status === 200 && comEndNaLista.total_locais === 1, `${comEndNaLista && comEndNaLista.total_locais}`);
    const localDoCliente = await api(`/api/gestor/clientes/${cComEndereco.data.cliente.id}`, 'GET', gestor);
    test('endereço disponível para usar na OS', localDoCliente.status === 200 && localDoCliente.data.locais.length === 1 && localDoCliente.data.locais[0].endereco === 'Rua dos Ipês, 100', `${localDoCliente.status} ${localDoCliente.data.locais.length}`);
    const r3 = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: clienteId, nome: 'Local A', responsavel_nome: 'Responsavel A' });
    test('cria local com responsavel', r3.status === 201 && r3.data.local.responsavel_nome === 'Responsavel A', r3.status);
    localId = r3.data.local.id;
    const r4 = await api('/api/gestor/equipamentos', 'POST', gestor, { cliente_id: clienteId, local_id: localId, nome: 'Equip X', numero_serie: 'SERIE-1' });
    test('cria equipamento', r4.status === 201, r4.status);
    equipId = r4.data.equipamento.id;
    const r5 = await api('/api/gestor/equipamentos', 'POST', gestor, { cliente_id: clienteId, local_id: 999, nome: 'Y' });
    test('local de outro cliente -> 400', r5.status === 400, r5.status);
    const r6 = await api('/api/gestor/tecnicos', 'GET', gestor);
    test('lista tecnicos', r6.status === 200 && r6.data.tecnicos.length >= 1, r6.status);
    const osBody = { cliente_id: clienteId, local_id: localId, equipamento_id: equipId, servico: 'Manutencao', prioridade: 'alta', data_agendada: '2026-08-20', equipe_id: 1 };
    const r7 = await api('/api/gestor/os', 'POST', gestor, osBody);
    test('cria OS', r7.status === 201 && r7.data.os.numero === 'OS-0002', `${r7.status} ${r7.data && r7.data.error}`);
    osId = r7.data.os.id;
    const r8 = await api(`/api/gestor/os/${osId}`, 'PUT', gestor, { descricao: 'Observacao editada' });
    test('edita OS pendente', r8.status === 200 && r8.data.os.descricao === 'Observacao editada', r8.status);
    const r9 = await api('/api/gestor/agenda?data_inicio=2026-08-01&data_fim=2026-08-31', 'GET', gestor);
    test('agenda retorna OS', r9.status === 200 && r9.data.agenda.length >= 2, r9.status);
    const r10 = await api('/api/gestor/os', 'POST', gestor, { cliente_id: clienteId, local_id: localId, equipamento_id: equipId, servico: 'OS para excluir', prioridade: 'baixa', data_agendada: '2026-08-21', equipe_id: 1 });
    test('cria OS para teste de exclusão', r10.status === 201, r10.status);
    const osExcl = r10.data.os.id;
    const r11 = await api(`/api/gestor/os/${osExcl}`, 'DELETE', gestor);
    test('excluir OS mantém registro (status excluida)', r11.status === 200 && r11.data.os.status === 'excluida', `${r11.status} ${r11.data && r11.data.error}`);
    const r12 = await api('/api/gestor/os', 'GET', gestor);
    test('OS excluída some da lista', r12.status === 200 && !r12.data.ordens.some((o) => o.id === osExcl), r12.status);
    const r13 = await api(`/api/gestor/os?cliente_id=${clienteId}`, 'GET', gestor);
    test('OS excluída some da lista do cliente', r13.status === 200 && !r13.data.ordens.some((o) => o.id === osExcl), r13.status);
    const r14 = await api('/api/gestor/os?status=excluida', 'GET', gestor);
    test('OS excluída recuperável por filtro (histórico)', r14.status === 200 && r14.data.ordens.some((o) => o.id === osExcl), r14.status);
    const r15 = await api(`/api/gestor/os/${osExcl}`, 'GET', gestor);
    test('OS excluída ainda consultável por id', r15.status === 200 && r15.data.os.status === 'excluida', r15.status);
    const r16 = await api('/api/tecnico/os', 'GET', tecnico);
    test('técnico não vê OS excluída', r16.status === 200 && !r16.data.ordens.some((o) => o.id === osExcl), r16.status);
  }

  console.log('Fase 5 - Tecnico (execucao, fotos, assinatura, conclusao)');
  {
    const r1 = await api('/api/tecnico/os', 'GET', tecnico);
    test('ve somente suas OS', r1.status === 200 && r1.data.ordens.length === 2, `${r1.status} n=${r1.data.ordens.length}`);
    const r2 = await api('/api/tecnico/os/999', 'GET', tecnico);
    test('OS inexistente -> 404', r2.status === 404, r2.status);
    const r3 = await api(`/api/tecnico/os/${osId}/iniciar`, 'POST', tecnico);
    test('inicia execucao', r3.status === 200 && r3.data.os.status === 'em_andamento', r3.status);
    const r4 = await api(`/api/tecnico/os/${osId}/iniciar`, 'POST', tecnico);
    test('iniciar duas vezes -> 400', r4.status === 400, r4.status);
    const r5 = await api(`/api/tecnico/os/${osId}/execucao`, 'PUT', tecnico, { diagnostico: 'Diagnostico X', servico_executado: 'Servico executado', necessidade_adicional: 'substituicao_equipamento', assinatura_nome: 'Responsavel Teste' });
    test('registra execucao', r5.status === 200 && r5.data.execucao.servico_executado === 'Servico executado', r5.status);
    test('registra necessidade adicional', r5.status === 200 && r5.data.execucao.necessidade_adicional === 'substituicao_equipamento', r5.status);
    const r6 = await upload(`/api/tecnico/os/${osId}/anexos`, tecnico, 'arquivos', 'foto1.png', PNG);
    test('upload foto', r6.status === 201 && r6.data.anexos.length === 1, r6.status);
    const r7 = await upload(`/api/tecnico/os/${osId}/assinatura`, tecnico, 'assinatura', 'ass.png', PNG);
    test('upload assinatura', r7.status === 201 && r7.data.assinatura.includes('/uploads/'), r7.status);
    const r8 = await api(`/api/tecnico/os/${osId}/concluir`, 'POST', tecnico);
    test('conclui execucao', r8.status === 200 && r8.data.os.status === 'aguardando_validacao', r8.status);
    const r9 = await api(`/api/tecnico/os/${osId}/concluir`, 'POST', tecnico);
    test('concluir duas vezes -> 400', r9.status === 400, r9.status);
    const r10 = await fetch(base + r6.data.anexos[0].arquivo, { method: 'GET' });
    test('foto servida estaticamente', r10.status === 200, r10.status);
  }

  console.log('Fase 4b - Gestor valida atendimento');
  {
    const r1 = await api(`/api/gestor/os/${osId}/validar`, 'PATCH', gestor, { aprovado: true, recomendacoes: 'Rec: trocar peca' });
    test('valida OS aprovada', r1.status === 200 && r1.data.os.status === 'concluida' && r1.data.os.relatorio.status === 'aprovado' && r1.data.os.relatorio.enviado_comercial === 1, r1.status);
    const opAuto = await api('/api/comercial/oportunidades', 'GET', comercial);
    test('aprovacao com necessidade -> oportunidade criada automaticamente', opAuto.status === 200 && opAuto.data.oportunidades.some((o) => o.status === 'novo' && o.tipo === 'substituicao_equipamento'), opAuto.status);
    const r2 = await api(`/api/gestor/os/${osId}/validar`, 'PATCH', gestor, { aprovado: true });
    test('revalidar -> 400', r2.status === 400, r2.status);
    const r3 = await api(`/api/gestor/os/${osId}/cancelar`, 'PATCH', gestor);
    test('cancelar OS concluida -> 400', r3.status === 400, r3.status);
  }

  console.log('Fase 6 - Comercial (relatorios e oportunidades)');
  let opId;
  {
    const r1 = await api('/api/comercial/relatorios', 'GET', comercial);
    test('relatorios aprovados visiveis', r1.status === 200 && r1.data.relatorios.length >= 1 && r1.data.relatorios[0].recomendacoes === 'Rec: trocar peca', r1.status);
    const relatorioId = r1.data.relatorios[0].id;
    const r2 = await api('/api/comercial/oportunidades', 'GET', comercial);
    const opAuto = r2.data.oportunidades.find((o) => o.relatorio_id === relatorioId);
    test('oportunidade automatica listada com status novo', opAuto && opAuto.status === 'novo', opAuto && opAuto.status);
    opId = opAuto.id;
    const r2b = await api('/api/comercial/oportunidades', 'POST', comercial, { relatorio_id: relatorioId, descricao: 'Duplicada' });
    test('oportunidade duplicada -> 409', r2b.status === 409, r2b.status);
    const r3 = await api('/api/comercial/oportunidades', 'POST', comercial, { relatorio_id: 999, descricao: 'X' });
    test('oportunidade relatorio invalido -> 404', r3.status === 404, r3.status);
    const r4 = await api(`/api/comercial/oportunidades/${opId}`, 'PUT', comercial, { status: 'em_negociacao', valor_estimado: 1500 });
    test('atualiza oportunidade', r4.status === 200 && r4.data.oportunidade.status === 'em_negociacao', r4.status);
    const r5 = await api(`/api/comercial/relatorios/${relatorioId}`, 'GET', comercial);
    const temHist = r5.data.historico.some((h) => h.campo === 'status' && h.valor_novo === 'em_negociacao');
    test('abertura registrada + alteracao comercial no historico', r5.status === 200 && r5.data.relatorio.aberto_por && temHist, `${r5.status}`);
    const r6 = await api(`/api/comercial/oportunidades/${opId}`, 'DELETE', comercial);
    test('exclui oportunidade', r6.status === 204, r6.status);
  }

  console.log('Fase 6b - Fluxo Relatório Técnico -> Comercial (documento)');
  {
    const osDoc = { cliente_id: clienteId, local_id: localId, equipamento_id: equipId, servico: 'Manutencao preventiva', prioridade: 'alta', data_agendada: '2026-10-05', equipe_id: 1 };
    const c1 = await api('/api/gestor/os', 'POST', gestor, osDoc);
    test('cria OS do fluxo tecnico->comercial', c1.status === 201, c1.status);
    const osDocId = c1.data.os.id;
    await api(`/api/tecnico/os/${osDocId}/iniciar`, 'POST', tecnico);
    const c2 = await api(`/api/tecnico/os/${osDocId}/execucao`, 'PUT', tecnico, { diagnostico: 'Diagnostico tecnico original', servico_executado: 'Preventiva executada', necessidade_adicional: 'nova_manutencao', assinatura_nome: 'Responsavel Teste' });
    test('tecnico informa necessidade adicional', c2.status === 200 && c2.data.execucao.necessidade_adicional === 'nova_manutencao', c2.status);
    await upload(`/api/tecnico/os/${osDocId}/assinatura`, tecnico, 'assinatura', 'ass.png', PNG);
    const c3 = await api(`/api/tecnico/os/${osDocId}/concluir`, 'POST', tecnico);
    test('tecnico finaliza -> aguardando validacao', c3.status === 200 && c3.data.os.status === 'aguardando_validacao', c3.status);
    const c4 = await api('/api/comercial/relatorios', 'GET', comercial);
    test('sem validacao -> comercial ainda nao recebe', c4.status === 200 && !c4.data.relatorios.some((r) => r.os_numero === c1.data.os.numero), c4.status);

    const c5 = await api(`/api/gestor/os/${osDocId}/validar`, 'PATCH', gestor, { aprovado: false, complemento_motivo: 'Faltam fotos do equipamento' });
    test('gestor solicita complemento -> OS volta ao tecnico', c5.status === 200 && c5.data.os.status === 'em_andamento' && c5.data.os.relatorio.status === 'reprovado' && c5.data.os.relatorio.complemento_motivo === 'Faltam fotos do equipamento', c5.status);
    const c6 = await api('/api/comercial/relatorios', 'GET', comercial);
    test('complemento solicitado -> relatorio nao segue ao comercial', c6.status === 200 && !c6.data.relatorios.some((r) => r.os_numero === c1.data.os.numero), c6.status);
    const c7 = await api(`/api/tecnico/os/${osDocId}`, 'GET', tecnico);
    test('tecnico ve o motivo do complemento', c7.status === 200 && c7.data.os.execucao.complemento_solicitado === 'Faltam fotos do equipamento', c7.status);

    const c8 = await api(`/api/tecnico/os/${osDocId}/concluir`, 'POST', tecnico);
    test('tecnico reenvia apos complemento', c8.status === 200 && c8.data.os.status === 'aguardando_validacao', c8.status);
    const c9 = await api(`/api/gestor/os/${osDocId}/validar`, 'PATCH', gestor, { aprovado: true, recomendacoes: 'Rec: agendar nova manutencao em 6 meses' });
    test('gestor aprova -> relatorio disponibilizado ao comercial', c9.status === 200 && c9.data.os.relatorio.status === 'aprovado' && c9.data.os.relatorio.enviado_comercial === 1, c9.status);
    const c10 = await api('/api/comercial/relatorios', 'GET', comercial);
    const recDoc = c10.data.relatorios.find((r) => r.os_numero === c1.data.os.numero);
    test('comercial recebe relatorio apos validacao', c10.status === 200 && !!recDoc && recDoc.necessidade_adicional === 'nova_manutencao', c10.status);
    const c11 = await api(`/api/comercial/relatorios/${recDoc.id}`, 'GET', comercial);
    test('comercial visualiza relatorio completo', c11.status === 200 && Array.isArray(c11.data.relatorio.fotos) && c11.data.relatorio.diagnostico === 'Diagnostico tecnico original' && c11.data.relatorio.servico_executado === 'Preventiva executada' && c11.data.relatorio.oportunidade && c11.data.relatorio.oportunidade.status === 'novo', c11.status);
    const c12 = await api(`/api/comercial/relatorios/${recDoc.id}`, 'PUT', comercial, { diagnostico: 'hack' });
    test('comercial nao consegue editar informacoes tecnicas', c12.status === 404, c12.status);

    const opDocId = c11.data.relatorio.oportunidade.id;
    const c13 = await api(`/api/comercial/oportunidades/${opDocId}`, 'PUT', comercial, { status: 'necessita_contato', valor_estimado: 2500, data_contato: '2026-10-06', resultado_contato: 'Cliente pediu proposta', proposta_vinculada: 'PRO-001', previsao_fechamento: '2026-11-01' });
    test('comercial registra informacoes comerciais separadas', c13.status === 200 && c13.data.oportunidade.status === 'necessita_contato' && c13.data.oportunidade.proposta_vinculada === 'PRO-001', c13.status);
    const c14 = await api(`/api/comercial/relatorios/${recDoc.id}`, 'GET', comercial);
    const temStatus = c14.data.historico.some((h) => h.campo === 'status' && h.valor_novo === 'necessita_contato');
    test('relatorio original inalterado + historico comercial', c14.status === 200 && c14.data.relatorio.diagnostico === 'Diagnostico tecnico original' && c14.data.relatorio.oportunidade.status === 'necessita_contato' && temStatus, c14.status);

    const pdf1 = await fetch(base + `/api/comercial/relatorios/${recDoc.id}/pdf`, { headers: { Authorization: `Bearer ${comercial}` } });
    const pdfTexto = await pdf1.text();
    test('download do relatorio em PDF (html imprimivel)', pdf1.status === 200 && (pdf1.headers.get('content-type') || '').includes('text/html') && pdfTexto.includes(c1.data.os.numero) && pdfTexto.includes('Diagnostico tecnico original'), pdf1.status);
    const pdf2 = await fetch(base + '/api/comercial/relatorios/999999/pdf', { headers: { Authorization: `Bearer ${comercial}` } });
    test('pdf de relatorio inexistente -> 404', pdf2.status === 404, pdf2.status);
    const pdf3 = await fetch(base + `/api/comercial/relatorios/${recDoc.id}/pdf`);
    test('pdf sem token -> 401', pdf3.status === 401, pdf3.status);

    const g1 = await api('/api/comercial/relatorios', 'GET', gestor);
    test('gestor lista relatorios validados', g1.status === 200 && g1.data.relatorios.length >= 1, g1.status);
    const g2 = await api(`/api/comercial/relatorios/${recDoc.id}`, 'GET', gestor);
    test('gestor visualiza relatorio completo', g2.status === 200 && g2.data.relatorio.diagnostico === 'Diagnostico tecnico original', g2.status);
    const g3 = await fetch(base + `/api/comercial/relatorios/${recDoc.id}/pdf`, { headers: { Authorization: `Bearer ${gestor}` } });
    test('gestor baixa PDF do relatorio', g3.status === 200 && (g3.headers.get('content-type') || '').includes('text/html'), g3.status);
    const g4 = await api('/api/comercial/oportunidades', 'GET', gestor);
    test('gestor nao acessa oportunidades (area comercial)', g4.status === 403, g4.status);

    const osSem = { cliente_id: clienteId, local_id: localId, servico: 'Troca de lampada', prioridade: 'media', data_agendada: '2026-10-10', equipe_id: 1 };
    const d1 = await api('/api/gestor/os', 'POST', gestor, osSem);
    const osSemId = d1.data.os.id;
    await api(`/api/tecnico/os/${osSemId}/iniciar`, 'POST', tecnico);
    await api(`/api/tecnico/os/${osSemId}/execucao`, 'PUT', tecnico, { servico_executado: 'Lampada trocada', necessidade_adicional: 'nao', assinatura_nome: 'Responsavel Teste' });
    await upload(`/api/tecnico/os/${osSemId}/assinatura`, tecnico, 'assinatura', 'ass.png', PNG);
    await api(`/api/tecnico/os/${osSemId}/concluir`, 'POST', tecnico);
    const d2 = await api(`/api/gestor/os/${osSemId}/validar`, 'PATCH', gestor, { aprovado: true });
    test('aprovacao sem necessidade -> nao envia ao comercial', d2.status === 200 && d2.data.os.relatorio.enviado_comercial === 0, d2.status);
    const d3 = await api('/api/comercial/relatorios', 'GET', comercial);
    test('relatorio sem oportunidade nao aparece para o comercial', d3.status === 200 && !d3.data.relatorios.some((r) => r.os_numero === d1.data.os.numero), d3.status);
    const d4 = await api(`/api/comercial/relatorios?status=necessita_contato`, 'GET', comercial);
    test('filtro por status comercial', d4.status === 200 && d4.data.relatorios.length >= 1 && d4.data.relatorios.every((r) => r.oportunidade_status === 'necessita_contato'), d4.status);
  }

  console.log('Fase 7 - Calendário Operacional do Gestor (testes do documento)');
  {
    const OS_CAL = '2026-09-10';
    const rT2 = await api('/api/auth/login', 'POST', null, { email: 'tecnico2@field.com', senha: 'tecnico123' });
    test('login tecnico 2 (seed)', rT2.status === 200 && rT2.data.token, rT2.status);
    const tecnico2Token = rT2.data.token;
    const tecnicosLista = await api('/api/gestor/tecnicos', 'GET', gestor);
    const tecnico2Id = tecnicosLista.data.tecnicos.find((t) => t.email === 'tecnico2@field.com').id;

    const osCal = {
      cliente_id: clienteId, local_id: localId, equipamento_id: equipId,
      servico: 'Calibração de sensores', prioridade: 'alta',
      data_agendada: OS_CAL, hora_inicio: '09:00', hora_fim: '11:00',
      equipe_id: 1
    };
    const r1 = await api('/api/gestor/os', 'POST', gestor, osCal);
    test('cria OS com horário', r1.status === 201 && r1.data.os.hora_inicio === '09:00' && r1.data.os.hora_fim === '11:00', `${r1.status} ${r1.data && r1.data.error}`);
    const osCalId = r1.data.os.id;
    const cal1 = await api(`/api/gestor/calendario?data_inicio=${OS_CAL}&data_fim=${OS_CAL}`, 'GET', gestor);
    test('criar OS -> aparece no calendário', cal1.status === 200 && cal1.data.eventos.some((e) => e.kind === 'os' && e.id === osCalId), cal1.status);

    const r2 = await api('/api/gestor/os', 'POST', gestor, { ...osCal, servico: 'OS conflitante', hora_inicio: '10:00', hora_fim: '11:30' });
    test('conflito de agenda -> 409 com detalhes', r2.status === 409 && Array.isArray(r2.data.conflitos) && r2.data.conflitos.length >= 1, `${r2.status} ${r2.data && r2.data.error}`);
    const r2b = await api('/api/gestor/os', 'POST', gestor, { ...osCal, servico: 'OS conflitante confirmada', hora_inicio: '10:00', hora_fim: '11:30', ignorar_conflitos: true });
    test('conflito com confirmação explícita -> 201', r2b.status === 201, r2b.status);

    const novaData = '2026-09-12';
    const r3 = await api(`/api/gestor/os/${osCalId}/horario`, 'PATCH', gestor, { data: novaData, hora_inicio: '13:00', hora_fim: '15:00' });
    test('mover OS (drag&drop) -> banco atualizado', r3.status === 200 && r3.data.os.data_agendada === novaData && r3.data.os.hora_inicio === '13:00', r3.status);
    const cal3 = await api(`/api/gestor/calendario?data_inicio=${novaData}&data_fim=${novaData}`, 'GET', gestor);
    test('alterar data -> calendário atualiza', cal3.status === 200 && cal3.data.eventos.some((e) => e.kind === 'os' && e.id === osCalId && e.data === novaData && e.hora_inicio === '13:00'), cal3.status);
    const hist3 = await api(`/api/gestor/historico?tipo=os&registro_id=${osCalId}`, 'GET', gestor);
    test('histórico registra movimentação', hist3.status === 200 && hist3.data.historico.some((h) => h.campo === 'data' && h.valor_novo === novaData), hist3.status);

    const rc = await api(`/api/gestor/os/${osCalId}/confirmar`, 'PATCH', gestor, { confirmada: true });
    test('confirma OS', rc.status === 200 && rc.data.os.confirmada === 1, rc.status);
    const calC = await api(`/api/gestor/calendario?data_inicio=${novaData}&data_fim=${novaData}`, 'GET', gestor);
    const alvoC = calC.data.eventos.find((e) => e.kind === 'os' && e.id === osCalId);
    test('status visual confirmada no calendário', alvoC && alvoC.status === 'confirmada', alvoC && alvoC.status);

    const equipeSul = await api('/api/admin/equipes', 'GET', admin);
    const equipeSulId = equipeSul.data.equipes.find((eq) => eq.nome === 'Equipe Sul').id;
    const criarSul = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tecnico Sul', email: 'tecnicosul@field.com', senha: '123456', perfil: 'tecnico', equipe_id: equipeSulId });
    test('cadastra tecnico na Equipe Sul', criarSul.status === 201 && criarSul.data.usuario.equipes.some((eq) => eq.id === equipeSulId), criarSul.status);
    const r4 = await api(`/api/gestor/os/${osCalId}`, 'PUT', gestor, { equipe_id: equipeSulId });
    test('altera equipe da OS', r4.status === 200 && r4.data.os.equipe_id === equipeSulId, r4.status);
    const loginSul = await api('/api/auth/login', 'POST', null, { email: 'tecnicosul@field.com', senha: '123456' });
    const tecnicoSul = loginSul.data.token;
    const agNovo = await api(`/api/tecnico/agenda?data_inicio=${novaData}&data_fim=${novaData}`, 'GET', tecnicoSul);
    test('OS aparece na agenda da nova equipe', agNovo.status === 200 && agNovo.data.agenda.some((i) => i.kind === 'os' && i.id === osCalId), agNovo.status);
    const agAntigo = await api(`/api/tecnico/agenda?data_inicio=${novaData}&data_fim=${novaData}`, 'GET', tecnico);
    test('OS não aparece na agenda da equipe anterior', agAntigo.status === 200 && !agAntigo.data.agenda.some((i) => i.kind === 'os' && i.id === osCalId), agAntigo.status);

    const r5 = await api('/api/gestor/atividades', 'POST', gestor, { titulo: 'Reunião de planejamento', tipo: 'reuniao', cliente_id: clienteId, data: '2026-09-14', hora_inicio: '10:00', hora_fim: '11:00', tecnico_id: tecnico2Id });
    test('cria atividade independente', r5.status === 201 && r5.data.atividade.tipo === 'reuniao', r5.status);
    const atvId = r5.data.atividade.id;
    const cal5 = await api('/api/gestor/calendario?data_inicio=2026-09-14&data_fim=2026-09-14', 'GET', gestor);
    test('criar atividade -> aparece no calendário', cal5.status === 200 && cal5.data.eventos.some((e) => e.kind === 'atividade' && e.id === atvId), cal5.status);
    const ag5 = await api('/api/tecnico/agenda?data_inicio=2026-09-14&data_fim=2026-09-14', 'GET', tecnico2Token);
    test('atividade aparece na agenda do técnico', ag5.status === 200 && ag5.data.agenda.some((i) => i.kind === 'atividade' && i.id === atvId), ag5.status);
    const agNao5 = await api('/api/tecnico/agenda?data_inicio=2026-09-14&data_fim=2026-09-14', 'GET', tecnico);
    test('técnico não vê agenda de outro técnico', agNao5.status === 200 && !agNao5.data.agenda.some((i) => i.kind === 'atividade' && i.id === atvId), agNao5.status);

    const r6 = await api('/api/gestor/atividades', 'POST', gestor, { titulo: 'Levantamento pós-serviço', tipo: 'levantamento', os_id: osCalId, cliente_id: clienteId, data: '2026-09-15', hora_inicio: '08:00', hora_fim: '09:00', tecnico_id: 3 });
    test('adiciona atividade à OS', r6.status === 201 && r6.data.atividade.os_id === osCalId, r6.status);
    const cal6 = await api('/api/gestor/calendario?data_inicio=2026-09-15&data_fim=2026-09-15', 'GET', gestor);
    test('atividade vinculada aparece no calendário', cal6.status === 200 && cal6.data.eventos.some((e) => e.kind === 'atividade' && e.id === r6.data.atividade.id && e.os_id === osCalId), cal6.status);
    const hist6 = await api(`/api/gestor/historico?tipo=os&registro_id=${osCalId}`, 'GET', gestor);
    test('atividade aparece no histórico da OS', hist6.status === 200 && hist6.data.historico.some((h) => h.campo === 'atividade'), hist6.status);

    const donoAtv = await api('/api/gestor/atividades', 'GET', gestor);
    test('lista atividades', donoAtv.status === 200 && donoAtv.data.atividades.length >= 1, donoAtv.status);

    const r13 = await api('/api/gestor/atividades', 'POST', gestor, { titulo: 'Atividade conflitante', tipo: 'outro', data: '2026-09-14', hora_inicio: '10:30', hora_fim: '12:00', tecnico_id: tecnico2Id });
    test('conflito de atividade -> 409', r13.status === 409 && r13.data.conflitos.length >= 1, r13.status);

    const r12 = await api(`/api/gestor/atividades/${atvId}`, 'PUT', gestor, { data: '2026-09-16', hora_inicio: '09:30' });
    test('mover atividade -> atualiza', r12.status === 200 && r12.data.atividade.data === '2026-09-16' && r12.data.atividade.hora_inicio === '09:30', r12.status);
    const hist12 = await api(`/api/gestor/historico?tipo=atividade&registro_id=${atvId}`, 'GET', gestor);
    test('histórico da atividade registra alteração de horário', hist12.status === 200 && hist12.data.historico.some((h) => h.campo === 'hora_inicio' && h.valor_novo === '09:30'), hist12.status);
    const r14 = await api(`/api/gestor/atividades/${atvId}/status`, 'PATCH', gestor, { status: 'concluida' });
    test('status de atividade alterado', r14.status === 200 && r14.data.atividade.status === 'concluida', r14.status);

    const r8 = await api('/api/gestor/calendario', 'GET', tecnico);
    test('técnico -> calendário geral bloqueado', r8.status === 403, r8.status);
    const r8b = await api('/api/gestor/atividades', 'GET', tecnico);
    test('técnico -> atividades bloqueado', r8b.status === 403, r8b.status);
    const r9 = await api('/api/gestor/calendario', 'GET', comercial);
    test('comercial -> calendário bloqueado', r9.status === 403, r9.status);
    const r9b = await api('/api/gestor/historico', 'GET', comercial);
    test('comercial -> histórico bloqueado', r9b.status === 403, r9b.status);
    const r10 = await api('/api/gestor/calendario', 'GET', admin);
    test('admin visualiza calendário completo + indicadores', r10.status === 200 && r10.data.indicadores && typeof r10.data.indicadores.os_hoje === 'number' && Array.isArray(r10.data.eventos), r10.status);
  }

  console.log('Fase 8 - Teste obrigatório do documento (distribuição por Equipe)');
  {
    const criarA = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Alfa' });
    const criarB = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Beta' });
    test('cria Equipe A e Equipe B', criarA.status === 201 && criarB.status === 201, `${criarA.status} ${criarB.status}`);
    const equipeAId = criarA.data.equipe.id;
    const equipeBId = criarB.data.equipe.id;

    const idsA = [];
    for (let i = 1; i <= 3; i++) {
      const r = await api('/api/admin/usuarios', 'POST', admin, { nome: `Tecnico A${i}`, email: `tecnicoa${i}@field.com`, senha: '123456', perfil: 'tecnico', equipe_id: equipeAId });
      if (r.status === 201) idsA.push(r.data.usuario.id);
    }
    test('cadastra 3 usuários técnicos na Equipe A', idsA.length === 3, `n=${idsA.length}`);
    const rB = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tecnico B1', email: 'tecnicob1@field.com', senha: '123456', perfil: 'tecnico', equipe_id: equipeBId });
    test('cadastra pelo menos 1 usuário na Equipe B', rB.status === 201, rB.status);

    const rAB = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tecnico AB', email: 'tecnicoab@field.com', senha: '123456', perfil: 'tecnico', equipe_ids: [equipeAId, equipeBId] });
    test('usuário vinculado a mais de uma equipe (N:N)', rAB.status === 201 && rAB.data.usuario.equipes.length === 2, rAB.status);

    const login = async (email) => (await api('/api/auth/login', 'POST', null, { email, senha: '123456' })).data.token;
    const tokenA1 = await login('tecnicoa1@field.com');
    const tokenA2 = await login('tecnicoa2@field.com');
    const tokenA3 = await login('tecnicoa3@field.com');
    const tokenB1 = await login('tecnicob1@field.com');
    const tokenAB = await login('tecnicoab@field.com');
    test('logins dos usuários das equipes', !!(tokenA1 && tokenA2 && tokenA3 && tokenB1 && tokenAB));

    const criar = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: clienteId, local_id: localId, equipamento_id: equipId,
      servico: 'Atendimento por equipe', data_agendada: '2026-11-05',
      hora_inicio: '09:00', hora_fim: '11:00', equipe_id: equipeAId
    });
    test('gestor cria OS selecionando a Equipe A', criar.status === 201 && criar.data.os.equipe_id === equipeAId, criar.status);
    const osEquipeId = criar.data.os.id;

    const v1 = await api('/api/tecnico/os', 'GET', tokenA1);
    const v2 = await api('/api/tecnico/os', 'GET', tokenA2);
    const v3 = await api('/api/tecnico/os', 'GET', tokenA3);
    const vAB = await api('/api/tecnico/os', 'GET', tokenAB);
    test('todos os usuários da Equipe A visualizam a OS', [v1, v2, v3, vAB].every((r) => r.status === 200 && r.data.ordens.some((o) => o.id === osEquipeId)), `${v1.status} ${v2.status} ${v3.status} ${vAB.status}`);
    const vb = await api('/api/tecnico/os', 'GET', tokenB1);
    test('usuário da Equipe B não visualiza a OS', vb.status === 200 && !vb.data.ordens.some((o) => o.id === osEquipeId), vb.status);
    const vb2 = await api(`/api/tecnico/os/${osEquipeId}`, 'GET', tokenB1);
    test('acesso direto à OS bloqueado para outra equipe', vb2.status === 404, vb2.status);

    const ini = await api(`/api/tecnico/os/${osEquipeId}/iniciar`, 'POST', tokenA1);
    test('iniciar registra o usuário que assumiu + data/hora de início', ini.status === 200 && ini.data.execucao && ini.data.execucao.tecnico_id === idsA[0] && !!ini.data.execucao.iniciada_em, ini.status);

    const assumir = await api(`/api/tecnico/os/${osEquipeId}/iniciar`, 'POST', tokenA2);
    test('colega da mesma equipe assume o atendimento', assumir.status === 200 && assumir.data.execucao.tecnico_id === idsA[1], assumir.status);

    await api(`/api/tecnico/os/${osEquipeId}/execucao`, 'PUT', tokenA2, { servico_executado: 'Serviço executado pela equipe', assinatura_nome: 'Responsável Teste' });
    const upAss = await upload(`/api/tecnico/os/${osEquipeId}/assinatura`, tokenA2, 'assinatura', 'ass.png', PNG);
    test('assinatura registrada na execução', upAss.status === 201, upAss.status);
    const fin = await api(`/api/tecnico/os/${osEquipeId}/concluir`, 'POST', tokenA2);
    test('finalizar registra quem concluiu + data/hora de conclusão', fin.status === 200 && fin.data.os.status === 'aguardando_validacao', fin.status);
    const det = await api(`/api/tecnico/os/${osEquipeId}`, 'GET', tokenA2);
    test('concluida_por e concluida_em registrados', det.status === 200 && det.data.os.execucao.concluida_por === idsA[1] && !!det.data.os.execucao.concluida_em && det.data.os.execucao.concluida_por_nome === 'Tecnico A2', `${det.status} ${det.data.os.execucao.concluida_por}`);
    test('OS retorna ao gestor para validação', det.status === 200 && det.data.os.status === 'aguardando_validacao', det.status);
    const val = await api(`/api/gestor/os/${osEquipeId}/validar`, 'PATCH', gestor, { aprovado: true });
    test('gestor valida a OS executada pela equipe', val.status === 200 && val.data.os.status === 'concluida', val.status);
  }

  console.log('Fase 9 - Avaliação do cliente por OS');
  {
    const clientes = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes;
    const clienteSeed = clientes.find((c) => c.nome === 'MedicalThermo Herzog') || clientes[0];
    const locais = (await api('/api/gestor/locais', 'GET', gestor)).data.locais;
    const localSeed = locais.find((l) => l.cliente_id === clienteSeed.id) || locais[0];
    const equipamentos = (await api(`/api/gestor/equipamentos?cliente_id=${clienteSeed.id}`, 'GET', gestor)).data.equipamentos;
    const equipSeed = equipamentos[0];

    const criar = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: clienteSeed.id, local_id: localSeed.id, equipamento_id: equipSeed.id,
      servico: 'Manutenção corretiva - avaliação', data_agendada: '2026-12-01',
      hora_inicio: '09:00', hora_fim: '11:00', equipe_id: 1
    });
    test('cria OS para fluxo de avaliação', criar.status === 201 && criar.data.os.id, `${criar.status} ${JSON.stringify(criar.data)}`);
    const osId1 = criar.data.os.id;

    const linkAntes = await api(`/api/gestor/os/${osId1}/avaliacao/link`, 'POST', gestor);
    test('link de avaliação indisponível antes da conclusão', linkAntes.status === 400, linkAntes.status);

    await api(`/api/tecnico/os/${osId1}/iniciar`, 'POST', tecnico);
    await api(`/api/tecnico/os/${osId1}/execucao`, 'PUT', tecnico, { servico_executado: 'Serviço para avaliação', assinatura_nome: 'Responsável Avaliação' });
    await upload(`/api/tecnico/os/${osId1}/assinatura`, tecnico, 'assinatura', 'ass2.png', PNG);
    await api(`/api/tecnico/os/${osId1}/concluir`, 'POST', tecnico);
    const val = await api(`/api/gestor/os/${osId1}/validar`, 'PATCH', gestor, { aprovado: true });
    test('validação libera a avaliação automaticamente', val.status === 200 && val.data.os.status === 'concluida' && val.data.os.avaliacao && val.data.os.avaliacao.status === 'pendente', `${val.status} ${JSON.stringify(val.data.os?.avaliacao)}`);
    const token1 = val.data.os.avaliacao.token;
    test('cada OS possui token exclusivo', typeof token1 === 'string' && token1.length >= 30, token1);

    const publ1 = await api(`/api/avaliacao/${token1}`);
    test('link público consultável sem login', publ1.status === 200 && publ1.data.avaliacao.status === 'pendente' && publ1.data.avaliacao.os.numero, publ1.status);

    const linkApos = await api(`/api/gestor/os/${osId1}/avaliacao/link`, 'POST', gestor);
    test('gerar link retorna o mesmo token da OS', linkApos.status === 200 && linkApos.data.avaliacao.token === token1, `${linkApos.status} ${linkApos.data.avaliacao?.token}`);

    const resp = await api(`/api/avaliacao/${token1}`, 'POST', null, { nota: 5, resolveu_necessidade: 'sim', comentario: 'Atendimento excelente' });
    test('cliente responde a avaliação sem login', resp.status === 200 && resp.data.avaliacao.status === 'respondida' && resp.data.avaliacao.resposta.nota === 5, `${resp.status} ${JSON.stringify(resp.data.avaliacao)}`);

    test('resposta do POST usa o mesmo formato aninhado do GET', !!resp.data.avaliacao.os && resp.data.avaliacao.os.numero && typeof resp.data.avaliacao.resposta === 'object' && resp.data.avaliacao.resposta.nota === 5, JSON.stringify(resp.data.avaliacao));

    const reResp = await api(`/api/avaliacao/${token1}`, 'POST', null, { nota: 4, resolveu_necessidade: 'sim' });
    test('segunda resposta bloqueada', reResp.status === 400, reResp.status);

    const invalida = await api(`/api/avaliacao/${token1}`, 'POST', null, { nota: 6, resolveu_necessidade: 'sim' });
    test('nota fora do intervalo rejeitada', invalida.status === 400, invalida.status);

    const publ2 = await api(`/api/avaliacao/${token1}`);
    test('resposta visível no link público', publ2.status === 200 && publ2.data.avaliacao.status === 'respondida' && publ2.data.avaliacao.resposta.nota === 5 && publ2.data.avaliacao.resposta.comentario === 'Atendimento excelente', publ2.status);

    const osDet = await api(`/api/gestor/os/${osId1}`, 'GET', gestor);
    test('nota e comentário aparecem na própria OS', osDet.status === 200 && osDet.data.os.avaliacao.status === 'respondida' && osDet.data.os.avaliacao.nota === 5 && osDet.data.os.avaliacao.comentario === 'Atendimento excelente', `${osDet.status} ${JSON.stringify(osDet.data.os?.avaliacao)}`);

    const criar2 = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: clienteSeed.id, local_id: localSeed.id, equipamento_id: equipSeed.id,
      servico: 'Segunda OS para o mesmo cliente', data_agendada: '2026-12-05',
      hora_inicio: '14:00', hora_fim: '16:00', equipe_id: 1
    });
    const osId2 = criar2.data.os.id;
    await api(`/api/tecnico/os/${osId2}/iniciar`, 'POST', tecnico);
    await api(`/api/tecnico/os/${osId2}/execucao`, 'PUT', tecnico, { servico_executado: 'Serviço 2', assinatura_nome: 'Responsável Avaliação' });
    await upload(`/api/tecnico/os/${osId2}/assinatura`, tecnico, 'assinatura', 'ass3.png', PNG);
    await api(`/api/tecnico/os/${osId2}/concluir`, 'POST', tecnico);
    const val2 = await api(`/api/gestor/os/${osId2}/validar`, 'PATCH', gestor, { aprovado: true });
    const token2 = val2.data.os.avaliacao.token;
    test('mesmo cliente recebe link diferente por OS', token2 !== token1, token2);

    const gestLista = await api('/api/gestor/avaliacoes', 'GET', gestor);
    test('gestor lista avaliações com indicadores', gestLista.status === 200 && gestLista.data.avaliacoes.some((a) => a.os_id === osId1) && gestLista.data.indicadores.total >= 2 && gestLista.data.indicadores.n5 >= 1 && gestLista.data.indicadores.pendentes >= 1 && gestLista.data.indicadores.nota_media === 5, `${gestLista.status} ${JSON.stringify(gestLista.data.indicadores)}`);
    const gestPend = await api('/api/gestor/avaliacoes?status=pendente', 'GET', gestor);
    test('filtro por status pendente', gestPend.status === 200 && gestPend.data.avaliacoes.length >= 1 && gestPend.data.avaliacoes.some((a) => a.os_id === osId2), gestPend.status);

    const comLista = await api('/api/comercial/avaliacoes', 'GET', comercial);
    test('comercial acompanha avaliações por cliente', comLista.status === 200 && comLista.data.clientes.some((c) => c.nome === 'MedicalThermo Herzog' && c.total >= 2 && c.nota_media === 5 && c.positivas >= 1) && comLista.data.avaliacoes.some((a) => a.os_id === osId1), `${comLista.status} ${JSON.stringify(comLista.data.clientes)}`);

    const semAuth = await api('/api/gestor/avaliacoes');
    test('avaliações internas exigem login', semAuth.status === 401, semAuth.status);
    const tokenInvalido = await api('/api/avaliacao/abcdef123456');
    test('link inválido retorna 404', tokenInvalido.status === 404, tokenInvalido.status);
  }

  console.log('Fase 10 - Controle Diário de KM por Equipe (documento)');
  {
    const eqA = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe KM A', descricao: 'Teste km' });
    const eqB = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe KM B', descricao: 'Teste km' });
    test('cria duas equipes para o controle de KM', eqA.status === 201 && eqB.status === 201, `${eqA.status} ${eqB.status}`);
    const eqAId = eqA.data.equipe.id;
    const eqBId = eqB.data.equipe.id;

    const uA = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Motorista A', email: 'km.a@field.com', senha: 'km123', perfil: 'tecnico', equipe_id: eqAId });
    const uB = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Motorista B', email: 'km.b@field.com', senha: 'km123', perfil: 'tecnico', equipe_id: eqBId });
    test('cadastra usuários nas equipes', uA.status === 201 && uB.status === 201, `${uA.status} ${uB.status}`);
    const tokenA = (await api('/api/auth/login', 'POST', null, { email: 'km.a@field.com', senha: 'km123' })).data.token;
    const tokenB = (await api('/api/auth/login', 'POST', null, { email: 'km.b@field.com', senha: 'km123' })).data.token;
    test('logins dos motoristas', !!tokenA && !!tokenB);

    const v1 = await api('/api/admin/veiculos', 'POST', admin, { placa: 'ABC-1234', descricao: 'Fiorino 1' });
    const v2 = await api('/api/admin/veiculos', 'POST', admin, { placa: 'DEF-5678', descricao: 'Fiorino 2' });
    test('cadastra veículos', v1.status === 201 && v2.status === 201, `${v1.status} ${v2.status}`);
    const vDup = await api('/api/admin/veiculos', 'POST', admin, { placa: 'ABC-1234' });
    test('placa duplicada -> 409', vDup.status === 409, vDup.status);
    const veiculoId1 = v1.data.veiculo.id;
    const veiculoId2 = v2.data.veiculo.id;

    const s1 = await api(`/api/tecnico/km/ultimo?veiculo_id=${veiculoId1}`, 'GET', tokenA);
    test('sem registros, não há sugestão de KM', s1.status === 200 && s1.data.km === null, s1.status);

    const r1 = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId1, motorista_id: uA.data.usuario.id, km_inicial: 45820, local_inicial: 'Base Norte' });
    test('inicia utilização com equipe/veículo/motorista obrigatórios', r1.status === 201 && r1.data.registro.status === 'em_utilizacao' && !!r1.data.registro.data_hora_inicio && r1.data.registro.equipe_id === eqAId, `${r1.status} ${JSON.stringify(r1.data.registro)}`);
    const reg1Id = r1.data.registro.id;

    const sin = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId1, motorista_id: uA.data.usuario.id, km_inicial: 45820, local_inicial: 'X' });
    test('dois registros simultâneos para o mesmo veículo bloqueados', sin.status === 409, sin.status);

    const fin1 = await api(`/api/tecnico/km/${reg1Id}/finalizar`, 'POST', tokenA, { km_final: 45900, local_final: 'Cliente X' });
    test('finaliza e calcula KM percorrido (45900 - 45820 = 80)', fin1.status === 200 && fin1.data.registro.status === 'finalizado' && fin1.data.registro.km_percorrido === 80, `${fin1.status} ${JSON.stringify(fin1.data.registro)}`);

    const fin2 = await api(`/api/tecnico/km/${reg1Id}/finalizar`, 'POST', tokenA, { km_final: 46000, local_final: 'Z' });
    test('não permite finalizar registro já finalizado', fin2.status === 400, fin2.status);

    const finMenor = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId1, motorista_id: uA.data.usuario.id, km_inicial: 45900, local_inicial: 'Base Norte' });
    const reg2Id = finMenor.data.registro.id;
    await api(`/api/tecnico/km/${reg2Id}/finalizar`, 'POST', tokenA, { km_final: 45900, local_final: 'Z' });
    test('KM final menor que KM inicial -> 400', (await api(`/api/tecnico/km/${reg2Id}/finalizar`, 'POST', tokenA, { km_final: 45800, local_final: 'Z' })).status === 400);

    const sug = await api(`/api/tecnico/km/ultimo?veiculo_id=${veiculoId1}`, 'GET', tokenA);
    test('sistema sugere o último KM conhecido do veículo', sug.status === 200 && sug.data.km === 45900, `${sug.status} ${sug.data.km}`);

    const r3 = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId1, motorista_id: uA.data.usuario.id, km_inicial: 45900, local_inicial: 'Base Norte' });
    test('inicia novo registro no mesmo dia', r3.status === 201, r3.status);
    const reg3Id = r3.data.registro.id;
    const fin3 = await api(`/api/tecnico/km/${reg3Id}/finalizar`, 'POST', tokenA, { km_final: 45968, local_final: 'Cliente Y' });
    test('segundo registro do dia calcula 68 km', fin3.status === 200 && fin3.data.registro.km_percorrido === 68, fin3.status);

    const v2R = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId2, motorista_id: uA.data.usuario.id, km_inicial: 32450, local_inicial: 'Base' });
    await api(`/api/tecnico/km/${v2R.data.registro.id}/finalizar`, 'POST', tokenA, { km_final: 32460, local_final: 'Cliente Z' });
    test('finaliza registro do segundo veículo (32450 -> 32460 = 10 km)', v2R.status === 201, v2R.status);

    const menor = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId2, motorista_id: uA.data.usuario.id, km_inicial: 100, local_inicial: 'X' });
    test('KM inicial menor que o último KM conhecido -> 400', menor.status === 400 && /último KM/.test(menor.data.error || ''), `${menor.status} ${menor.data.error}`);

    const outroVeic = await api('/api/tecnico/km', 'POST', tokenA, { equipe_id: eqAId, veiculo_id: veiculoId2, motorista_id: uA.data.usuario.id, km_inicial: 32500, local_inicial: 'Base' });
    test('segundo veículo em utilização simultânea permitido', outroVeic.status === 201 && outroVeic.data.registro.status === 'em_utilizacao', outroVeic.status);
    const regOutro = outroVeic.data.registro.id;

    const listaB = await api('/api/tecnico/km', 'GET', tokenB);
    test('técnico da Equipe B não vê registros da Equipe A', listaB.status === 200 && listaB.data.registros.length === 0, `${listaB.status} ${listaB.data.registros.length}`);

    const listaA = await api('/api/tecnico/km', 'GET', tokenA);
    test('técnico vê registros da própria equipe + total do dia', listaA.status === 200 && listaA.data.registros.some((r) => r.id === reg1Id) && listaA.data.total_dia === 158, `${listaA.status} total=${listaA.data.total_dia}`);

    const gestKm = await api('/api/gestor/km', 'GET', gestor);
    test('gestor consulta registros com indicadores', gestKm.status === 200 && gestKm.data.registros.length >= 4 && gestKm.data.indicadores.km_dia === 158 && gestKm.data.indicadores.km_periodo === 158 && gestKm.data.indicadores.veiculos_utilizados === 2 && gestKm.data.indicadores.veiculos_em_utilizacao === 1, `${gestKm.status} ${JSON.stringify(gestKm.data.indicadores)}`);
    test('agrupamento por equipe com KM totalizado', gestKm.data.km_por_equipe.some((e) => e.equipe_id === eqAId && e.km_total === 158), JSON.stringify(gestKm.data.km_por_equipe));

    const fEquipe = await api(`/api/gestor/km?equipe_id=${eqBId}`, 'GET', gestor);
    test('filtro por equipe', fEquipe.status === 200 && fEquipe.data.registros.length === 0, `${fEquipe.status} ${fEquipe.data.registros.length}`);
    const fVeic = await api(`/api/gestor/km?veiculo_id=${veiculoId2}`, 'GET', gestor);
    test('filtro por veículo', fVeic.status === 200 && fVeic.data.registros.every((r) => r.veiculo_id === veiculoId2) && fVeic.data.registros.length === 2, `${fVeic.status} ${fVeic.data.registros.length}`);
    const fMot = await api(`/api/gestor/km?motorista_id=${uA.data.usuario.id}`, 'GET', gestor);
    test('filtro por motorista', fMot.status === 200 && fMot.data.registros.every((r) => r.motorista_id === uA.data.usuario.id), `${fMot.status} ${fMot.data.registros.length}`);
    const fPer = await api(`/api/gestor/km?data_inicio=2026-11-01&data_fim=2026-11-30`, 'GET', gestor);
    test('filtro por período', fPer.status === 200 && fPer.data.registros.length === 0, `${fPer.status} ${fPer.data.registros.length}`);
    const fSt = await api('/api/gestor/km?status=em_utilizacao', 'GET', gestor);
    test('filtro por status', fSt.status === 200 && fSt.data.registros.length === 1 && fSt.data.registros[0].id === regOutro, `${fSt.status} ${fSt.data.registros.length}`);

    const ajuste = await api(`/api/gestor/km/${reg1Id}`, 'PATCH', gestor, { km_inicial: 45810 });
    test('gestor ajusta KM do registro (permissão específica)', ajuste.status === 200 && ajuste.data.registro.km_inicial === 45810 && ajuste.data.registro.km_percorrido === 90, `${ajuste.status} ${JSON.stringify(ajuste.data.registro)}`);
    const det = await api(`/api/gestor/km/${reg1Id}`, 'GET', gestor);
    test('histórico registra alterações do controle de KM', det.status === 200 && det.data.historico.some((h) => h.campo === 'km_inicial') && det.data.historico.some((h) => h.campo === 'finalizacao'), `${det.status} ${det.data.historico.length}`);

    const semAuth = await api('/api/gestor/km');
    test('controle de KM do gestor exige login', semAuth.status === 401, semAuth.status);
    const tecnicoEmGestor = await api('/api/gestor/km', 'GET', tokenA);
    test('técnico não acessa área do gestor de KM', tecnicoEmGestor.status === 403, tecnicoEmGestor.status);
  }

  console.log('Fase 11 - Mapa das Equipes (documento)');
  {
    const eqM1 = await api('/api/admin/equipes', 'POST', admin, { nome: 'Mapa Equipe A', descricao: 'mapa' });
    const eqM2 = await api('/api/admin/equipes', 'POST', admin, { nome: 'Mapa Equipe B', descricao: 'mapa' });
    test('cria duas equipes para o mapa', eqM1.status === 201 && eqM2.status === 201, `${eqM1.status} ${eqM2.status}`);
    const eqM1Id = eqM1.data.equipe.id;
    const eqM2Id = eqM2.data.equipe.id;

    const uM = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tec Map', email: 'tec.map@field.com', senha: 'map123', perfil: 'tecnico', equipe_id: eqM1Id });
    test('cadastra técnico na equipe do mapa', uM.status === 201, uM.status);
    const tokenTecMap = (await api('/api/auth/login', 'POST', null, { email: 'tec.map@field.com', senha: 'map123' })).data.token;
    test('login do técnico do mapa', !!tokenTecMap);

    const cM = await api('/api/gestor/clientes', 'POST', gestor, { nome: 'Cliente Mapa' });
    const cMId = cM.data.cliente.id;
    const l1 = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cMId, nome: 'Local Mapa A', endereco: 'Av. Teste, 10', cidade: 'São Paulo', estado: 'SP', latitude: -23.55, longitude: -46.63 });
    const l2 = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cMId, nome: 'Local Mapa B', endereco: 'Rua Teste, 20', cidade: 'Belo Horizonte', estado: 'MG', latitude: -19.92, longitude: -43.93 });
    const l3 = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cMId, nome: 'Local Sem Coordenadas', endereco: 'Rua Sem GPS, 30' });
    test('cadastra locais com e sem coordenadas', l1.status === 201 && l2.status === 201 && l3.status === 201 && l1.data.local.latitude === -23.55 && l3.data.local.latitude === null, `${l1.status} ${l2.status} ${l3.status}`);
    const l1Id = l1.data.local.id;
    const l2Id = l2.data.local.id;
    const l3Id = l3.data.local.id;

    const mt1 = await api('/api/gestor/equipamentos', 'POST', gestor, { cliente_id: cMId, local_id: l1Id, nome: 'MT Mapa', fabricante: 'Herzog', modelo: 'M-100' });
    test('cadastra equipamento MT no local', mt1.status === 201 && /^MT-/.test(mt1.data.equipamento.codigo_mt || ''), `${mt1.status} ${JSON.stringify(mt1.data.equipamento)}`);
    const mt1Id = mt1.data.equipamento.id;

    const os1 = await api('/api/gestor/os', 'POST', gestor, { cliente_id: cMId, local_id: l1Id, equipamento_id: mt1Id, servico: 'Preventiva mapa A', tipo_atendimento: 'preventiva', data_agendada: '2026-09-10', hora_inicio: '08:00', hora_fim: '10:00', equipe_id: eqM1Id });
    const os2 = await api('/api/gestor/os', 'POST', gestor, { cliente_id: cMId, local_id: l2Id, servico: 'Corretiva mapa B', tipo_atendimento: 'corretiva', data_agendada: '2026-09-10', hora_inicio: '13:00', hora_fim: '15:00', equipe_id: eqM2Id });
    const os3 = await api('/api/gestor/os', 'POST', gestor, { cliente_id: cMId, local_id: l3Id, servico: 'OS sem localização', data_agendada: '2026-09-10', hora_inicio: '16:00', hora_fim: '17:00', equipe_id: eqM1Id });
    test('cria OS em locais diferentes para cada equipe', os1.status === 201 && os2.status === 201 && os3.status === 201, `${os1.status} ${os2.status} ${os3.status}`);
    const os1Id = os1.data.os.id;
    const os2Id = os2.data.os.id;
    const os3Id = os3.data.os.id;

    const mapa = await api('/api/gestor/mapa?data=2026-09-10', 'GET', gestor);
    test('os dois atendimentos aparecem no mapa', mapa.status === 200 && mapa.data.ordens.some((o) => o.id === os1Id && o.tem_localizacao) && mapa.data.ordens.some((o) => o.id === os2Id && o.tem_localizacao), `${mapa.status} ${JSON.stringify(mapa.data.ordens.map((o) => o.numero))}`);
    const item1 = mapa.data.ordens.find((o) => o.id === os1Id);
    test('dados do marcador: equipe, nº OS, cliente, local, tipo, status', !!item1 && item1.equipe_id === eqM1Id && item1.numero && item1.cliente_nome === 'Cliente Mapa' && item1.local_nome === 'Local Mapa A' && item1.tipo_atendimento === 'preventiva' && item1.status === 'agendada', JSON.stringify(item1));
    test('MT vinculado aparece no detalhe', !!item1 && !!item1.mt && /^MT-/.test(item1.mt.codigo_mt), JSON.stringify(item1.mt));
    test('OS sem localização é sinalizada', mapa.data.ordens.some((o) => o.id === os3Id && !o.tem_localizacao), mapa.status);

    const fEq = await api(`/api/gestor/mapa?data=2026-09-10&equipe_id=${eqM1Id}`, 'GET', gestor);
    test('filtro por equipe', fEq.status === 200 && fEq.data.ordens.some((o) => o.id === os1Id) && !fEq.data.ordens.some((o) => o.id === os2Id), `${fEq.status} ${fEq.data.ordens.map((o) => o.numero)}`);
    const fSt = await api('/api/gestor/mapa?data=2026-09-10&status=agendada', 'GET', gestor);
    test('filtro por status (agendada)', fSt.status === 200 && fSt.data.ordens.length >= 1 && fSt.data.ordens.every((o) => o.status === 'agendada'), `${fSt.status} ${fSt.data.ordens.map((o) => o.status)}`);
    const fDt = await api('/api/gestor/mapa?data_inicio=2026-09-01&data_fim=2026-09-30', 'GET', gestor);
    test('filtro por período de data', fDt.status === 200 && fDt.data.ordens.some((o) => o.id === os1Id) && fDt.data.ordens.some((o) => o.id === os2Id), `${fDt.status} ${fDt.data.ordens.length}`);
    const fCl = await api(`/api/gestor/mapa?data=2026-09-10&cliente_id=${cMId}`, 'GET', gestor);
    test('filtro por cliente', fCl.status === 200 && fCl.data.ordens.length >= 1 && fCl.data.ordens.every((o) => o.cliente_id === cMId), `${fCl.status} ${fCl.data.ordens.length}`);
    const semData = await api('/api/gestor/mapa?data=2025-01-01', 'GET', gestor);
    test('data sem agendamentos retorna vazio', semData.status === 200 && semData.data.ordens.length === 0, `${semData.status} ${semData.data.ordens.length}`);

    const desl = await api(`/api/tecnico/os/${os1Id}/iniciar-deslocamento`, 'POST', tokenTecMap);
    test('técnico inicia deslocamento', desl.status === 200 && desl.data.os.status === 'em_deslocamento', `${desl.status} ${JSON.stringify(desl.data.os)}`);
    const mapaDesl = await api('/api/gestor/mapa?data=2026-09-10', 'GET', gestor);
    test('mapa reflete status em deslocamento', mapaDesl.status === 200 && mapaDesl.data.ordens.find((o) => o.id === os1Id).status === 'em_deslocamento', mapaDesl.status);
    const ini = await api(`/api/tecnico/os/${os1Id}/iniciar`, 'POST', tokenTecMap);
    test('técnico inicia atendimento após deslocamento', ini.status === 200 && ini.data.os.status === 'em_andamento', `${ini.status} ${JSON.stringify(ini.data.os)}`);
    const mapaAt = await api('/api/gestor/mapa?data=2026-09-10', 'GET', gestor);
    const itemAt = mapaAt.data.ordens.find((o) => o.id === os1Id);
    test('mapa reflete em atendimento + executor', !!itemAt && itemAt.status === 'em_atendimento' && itemAt.executor_nome === 'Tec Map' && !!itemAt.iniciada_em, JSON.stringify(itemAt));

    const troca = await api(`/api/gestor/os/${os2Id}`, 'PUT', gestor, { equipe_id: eqM1Id });
    test('altera equipe da OS', troca.status === 200 && troca.data.os.equipe_id === eqM1Id, `${troca.status} ${JSON.stringify(troca.data.os)}`);
    const mapaEquipe = await api(`/api/gestor/mapa?data=2026-09-10&equipe_id=${eqM1Id}`, 'GET', gestor);
    test('mapa reflete a nova equipe', mapaEquipe.status === 200 && mapaEquipe.data.ordens.some((o) => o.id === os2Id), mapaEquipe.status);

    const cal = await api('/api/gestor/calendario?data_inicio=2026-09-10&data_fim=2026-09-10', 'GET', gestor);
    test('integração com o calendário (mesma fonte de dados)', cal.status === 200 && cal.data.eventos.some((e) => e.kind === 'os' && e.id === os1Id && e.equipe_id === eqM1Id), `${cal.status} ${cal.data.eventos && cal.data.eventos.length}`);

    const t403 = await api('/api/gestor/mapa', 'GET', tecnico);
    test('técnico não acessa o mapa', t403.status === 403, t403.status);
    const c403 = await api('/api/gestor/mapa', 'GET', comercial);
    test('comercial não acessa o mapa', c403.status === 403, c403.status);
  }

  console.log('Fase 12 - Mapa, Agrupamento e Planejamento de OS (documento)');
  {
    const eqP = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Planejamento', descricao: 'planejamento' });
    const eqP0 = await api('/api/admin/equipes', 'POST', admin, { nome: 'Equipe Inicial Plan', descricao: 'inicial' });
    test('cria equipes para o planejamento', eqP.status === 201 && eqP0.status === 201, `${eqP.status} ${eqP0.status}`);
    const eqPId = eqP.data.equipe.id;
    const eqP0Id = eqP0.data.equipe.id;

    const uP = await api('/api/admin/usuarios', 'POST', admin, { nome: 'Tec Plan', email: 'tec.plan@field.com', senha: 'plan123', perfil: 'tecnico', equipe_id: eqPId });
    test('cadastra técnico na equipe do planejamento', uP.status === 201, uP.status);
    const tokenTecPlan = (await api('/api/auth/login', 'POST', null, { email: 'tec.plan@field.com', senha: 'plan123' })).data.token;
    test('login do técnico do planejamento', !!tokenTecPlan);

    const cP = await api('/api/gestor/clientes', 'POST', gestor, { nome: 'Cliente Planejamento' });
    const cPId = cP.data.cliente.id;

    const baseA = [-19.95, -44.1];
    const baseB = [-19.8, -43.9];
    const locaisA = [];
    const locaisB = [];
    for (let i = 0; i < 5; i++) {
      const r = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cPId, nome: `Local Plan A${i + 1}`, endereco: `Rua A${i + 1}, ${i + 1}`, cidade: 'Contagem', estado: 'MG', latitude: baseA[0] + i * 0.002, longitude: baseA[1] + (i % 2) * 0.003 });
      locaisA.push(r.data.local.id);
    }
    for (let i = 0; i < 3; i++) {
      const r = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cPId, nome: `Local Plan B${i + 1}`, endereco: `Rua B${i + 1}, ${i + 1}`, cidade: 'Belo Horizonte', estado: 'MG', latitude: baseB[0] + i * 0.003, longitude: baseB[1] + (i % 2) * 0.002 });
      locaisB.push(r.data.local.id);
    }
    test('cria 8 locais com coordenadas em duas regiões', locaisA.length === 5 && locaisB.length === 3, `${locaisA.length}/${locaisB.length}`);

    const osIds = [];
    for (let i = 0; i < 5; i++) {
      const body = { cliente_id: cPId, local_id: locaisA[i], servico: `Servico Plan A${i + 1}`, data_agendada: '2026-09-15', equipe_id: eqP0Id };
      if (i === 3) { body.hora_inicio = '14:00'; body.hora_fim = '15:30'; body.prioridade = 'media'; }
      if (i === 4) { body.prioridade = 'urgente'; }
      const r = await api('/api/gestor/os', 'POST', gestor, body);
      osIds.push(r.data.os.id);
    }
    for (let i = 0; i < 3; i++) {
      const r = await api('/api/gestor/os', 'POST', gestor, { cliente_id: cPId, local_id: locaisB[i], servico: `Servico Plan B${i + 1}`, data_agendada: '2026-09-15', equipe_id: eqP0Id });
      osIds.push(r.data.os.id);
    }
    test('cria 8 OS em locais diferentes', osIds.length === 8, `${osIds.length}`);

    const mapaPlan = await api('/api/gestor/mapa?data=2026-09-15', 'GET', gestor);
    test('exibe todas as OS no mapa', mapaPlan.status === 200 && osIds.every((id) => mapaPlan.data.ordens.some((o) => o.id === id && o.tem_localizacao)), `${mapaPlan.status} ${mapaPlan.data.ordens.length}`);

    const grupos = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: osIds });
    test('selecionar múltiplas OS e agrupar por proximidade', grupos.status === 200 && grupos.data.grupos.length === 2 && grupos.data.grupos.some((g) => g.quantidade === 5) && grupos.data.grupos.some((g) => g.quantidade === 3), `${grupos.status} ${JSON.stringify(grupos.data.grupos.map((g) => g.quantidade))}`);
    const grupoA = grupos.data.grupos.find((g) => g.quantidade === 5);
    const grupoB = grupos.data.grupos.find((g) => g.quantidade === 3);
    test('grupo 1 (Contagem) e grupo 2 (Belo Horizonte) sugeridos', !!grupoA && !!grupoB && grupoA.os[0].cidade === 'Contagem' && grupoB.os[0].cidade === 'Belo Horizonte', JSON.stringify(grupos.data.grupos.map((g) => g.nome)));
    test('sem localização não entra no agrupamento', grupos.data.sem_localizacao.length === 0, `${grupos.data.sem_localizacao.length}`);

    const localSemGps = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cPId, nome: 'Local Plan Sem GPS', endereco: 'Rua Sem Coordenadas, 10', cidade: 'Contagem', estado: 'MG' });
    const localSemGpsId = localSemGps.data.local.id;
    const osSemGps = await api('/api/gestor/os', 'POST', gestor, { cliente_id: cPId, local_id: localSemGpsId, servico: 'Servico Plan Sem GPS', data_agendada: '2026-09-15', equipe_id: eqP0Id });
    const osSemGpsId = osSemGps.data.os.id;
    const gruposComSemGps = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: [...osIds, osSemGpsId] });
    test('OS sem GPS listada fora do agrupamento', gruposComSemGps.status === 200 && gruposComSemGps.data.sem_localizacao.length === 1 && gruposComSemGps.data.sem_localizacao[0].id === osSemGpsId, `${gruposComSemGps.status} ${gruposComSemGps.data.sem_localizacao.length}`);

    const defineLoc = await api('/api/gestor/planejamento/localizacao', 'POST', gestor, { os_id: osSemGpsId, latitude: -19.95, longitude: -44.1, endereco: 'Rua Sem Coordenadas, 10', cidade: 'Contagem', estado: 'MG', nome_local: 'Local Plan Sem GPS' });
    test('gestor digita a localização e salva no mapa', defineLoc.status === 200 && defineLoc.data.tem_localizacao === true && defineLoc.data.latitude === -19.95 && defineLoc.data.longitude === -44.1 && !!defineLoc.data.local_id, `${defineLoc.status} ${JSON.stringify(defineLoc.data)}`);
    const localAtualizado = await api(`/api/gestor/clientes/${cPId}`, 'GET', gestor);
    const localVisto = localAtualizado.data.locais.find((l) => l.id === localSemGpsId);
    test('local atualizado com as coordenadas digitadas', localAtualizado.status === 200 && !!localVisto && localVisto.latitude === -19.95 && localVisto.longitude === -44.1 && localVisto.endereco === 'Rua Sem Coordenadas, 10', `${localAtualizado.status} ${JSON.stringify(localVisto)}`);
    const gruposAposGps = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: [...osIds, osSemGpsId] });
    test('OS passa a entrar no agrupamento após localização', gruposAposGps.status === 200 && gruposAposGps.data.sem_localizacao.length === 0 && gruposAposGps.data.grupos.reduce((s, g) => s + g.quantidade, 0) === 9, `${gruposAposGps.status} ${JSON.stringify(gruposAposGps.data.grupos.map((g) => g.quantidade))}`);
    const defineLocInvalida = await api('/api/gestor/planejamento/localizacao', 'POST', gestor, { os_id: osSemGpsId, latitude: 'abc', longitude: -44.1 });
    test('localização inválida -> 400', defineLocInvalida.status === 400, defineLocInvalida.status);
    const defineLocInexistente = await api('/api/gestor/planejamento/localizacao', 'POST', gestor, { os_id: 999999, latitude: -19.95, longitude: -44.1 });
    test('localização em OS inexistente -> 404', defineLocInexistente.status === 404, defineLocInexistente.status);

    const idsA = grupoA.os.map((o) => o.id);
    const remover = idsA[2];
    const grupoMenor = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: idsA.filter((id) => id !== remover) });
    test('remover OS do grupo manualmente (nova sugestão com 4)', grupoMenor.status === 200 && grupoMenor.data.grupos.length === 1 && grupoMenor.data.grupos[0].quantidade === 4, `${grupoMenor.status} ${grupoMenor.data.grupos[0] && grupoMenor.data.grupos[0].quantidade}`);
    const idsComExtra = [...idsA.filter((id) => id !== remover), osIds[6]];
    const grupoExtra = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: idsComExtra });
    test('adicionar OS de outra região gera novo grupo', grupoExtra.status === 200 && grupoExtra.data.grupos.length === 2 && grupoExtra.data.grupos.every((g) => g.quantidade >= 1), `${grupoExtra.status} ${grupoExtra.data.grupos.length}`);

    const seq = await api('/api/gestor/planejamento/sequencia', 'POST', gestor, { os_ids: idsA });
    test('otimizar sequência retorna todas as OS', seq.status === 200 && seq.data.sequencia.length === 5 && seq.data.incluidas === 5, `${seq.status} ${seq.data.sequencia && seq.data.sequencia.length}`);
    test('confirma distância estimada do roteiro', seq.status === 200 && typeof seq.data.total_km === 'number' && seq.data.total_km > 0 && seq.data.sequencia.every((o) => typeof o.distancia_anterior_km === 'number'), `${seq.status} ${seq.data.total_km}`);
    test('tempo estimado disponível', seq.status === 200 && typeof seq.data.tempo_estimado_horas === 'number' && seq.data.tempo_estimado_horas > 0, `${seq.status} ${seq.data.tempo_estimado_horas}`);
    const osComHorario = grupoA.os.find((o) => o.hora_inicio === '14:00');
    test('conflito/restrição de horário informado (nota)', seq.status === 200 && seq.data.notas.some((n) => n.includes(osComHorario.numero) && n.includes('horário')), JSON.stringify(seq.data.notas));
    test('OS urgente antecipada na sequência', seq.status === 200 && seq.data.sequencia[1].prioridade === 'urgente', `${seq.data.sequencia.map((o) => `${o.numero}(${o.prioridade})`).join(' > ')}`);
    const numComHorario = osComHorario.numero;
    test('OS com horário mantida na sequência respeitando restrição', seq.status === 200 && seq.data.sequencia[0].numero === numComHorario, `${seq.data.sequencia.map((o) => o.numero).join(' > ')}`);

    const antes = await api(`/api/gestor/os/${idsA[0]}`, 'GET', gestor);
    test('nenhuma OS alterada sem confirmação', antes.status === 200 && antes.data.os.equipe_id === eqP0Id, `${antes.status} ${JSON.stringify(antes.data.os.equipe_id)}`);

    const atrib = await api('/api/gestor/planejamento/atribuir', 'POST', gestor, { os_ids: idsA, equipe_id: eqPId });
    test('atribui grupo à equipe', atrib.status === 200 && atrib.data.atribuidas === 5 && atrib.data.equipe.id === eqPId, `${atrib.status} ${JSON.stringify(atrib.data)}`);
    const osApos = await api(`/api/gestor/os/${idsA[0]}`, 'GET', gestor);
    test('OS do grupo vinculadas à equipe', osApos.status === 200 && osApos.data.os.equipe_id === eqPId, `${osApos.status} ${JSON.stringify(osApos.data.os.equipe_id)}`);

    const osTec = await api('/api/tecnico/os', 'GET', tokenTecPlan);
    test('integrantes da equipe visualizam as OS', osTec.status === 200 && idsA.every((id) => osTec.data.ordens.some((o) => o.id === id)), `${osTec.status} ${osTec.data.ordens.length}`);

    const calPlan = await api('/api/gestor/calendario?data_inicio=2026-09-15&data_fim=2026-09-15', 'GET', gestor);
    test('sincronização com o calendário', calPlan.status === 200 && idsA.every((id) => calPlan.data.eventos.some((e) => e.kind === 'os' && e.id === id && e.equipe_id === eqPId)), `${calPlan.status} ${calPlan.data.eventos.length}`);

    const planej403 = await api('/api/gestor/planejamento/grupos', 'POST', tecnico, { os_ids: [idsA[0]] });
    test('técnico não acessa planejamento', planej403.status === 403, planej403.status);
    const grupoVazio = await api('/api/gestor/planejamento/grupos', 'POST', gestor, { os_ids: [] });
    test('agrupar sem OS -> 400', grupoVazio.status === 400, grupoVazio.status);
    const atribSemEquipe = await api('/api/gestor/planejamento/atribuir', 'POST', gestor, { os_ids: [idsA[0]] });
    test('atribuir sem equipe -> 400', atribSemEquipe.status === 400, atribSemEquipe.status);
  }

  console.log('Permissões cruzadas (403)');
  {
    const casos = [
      ['admin em /api/gestor (superusuario)', admin, '/api/gestor/clientes', 200],
      ['admin em /api/tecnico', admin, '/api/tecnico/os', 403],
      ['admin em /api/comercial/relatorios', admin, '/api/comercial/relatorios', 200],
      ['admin em /api/comercial/oportunidades', admin, '/api/comercial/oportunidades', 403],
      ['admin em /api/tecnico/agenda', admin, '/api/tecnico/agenda', 403],
      ['gestor em /api/admin', gestor, '/api/admin/usuarios', 403],
      ['gestor em /api/tecnico', gestor, '/api/tecnico/os', 403],
      ['gestor em /api/tecnico/agenda', gestor, '/api/tecnico/agenda', 403],
      ['gestor em /api/comercial/relatorios', gestor, '/api/comercial/relatorios', 200],
      ['gestor em /api/comercial/oportunidades', gestor, '/api/comercial/oportunidades', 403],
      ['tecnico em /api/admin', tecnico, '/api/admin/equipes', 403],
      ['tecnico em /api/gestor', tecnico, '/api/gestor/os', 403],
      ['tecnico em /api/gestor/calendario', tecnico, '/api/gestor/calendario', 403],
      ['tecnico em /api/gestor/mapa', tecnico, '/api/gestor/mapa', 403],
      ['tecnico em /api/comercial', tecnico, '/api/comercial/relatorios', 403],
      ['comercial em /api/admin', comercial, '/api/admin/usuarios', 403],
      ['comercial em /api/gestor', comercial, '/api/gestor/os', 403],
      ['comercial em /api/gestor/calendario', comercial, '/api/gestor/calendario', 403],
      ['comercial em /api/gestor/mapa', comercial, '/api/gestor/mapa', 403],
      ['comercial em /api/tecnico', comercial, '/api/tecnico/os', 403]
    ];
    for (const [nome, token, rota, esperado] of casos) {
      const r = await api(rota, 'GET', token);
      test(`${nome} -> ${esperado}`, r.status === esperado, r.status);
    }
  }

  console.log('Fase 13 - Cadastro e Importação de Clientes V2');
  {
    const imp = require('../server/importar-clientes');

    // --- funções puras ---
    test('normaliza documento removendo formatação', imp.normalizarDocumento('35.030.914/0001-80') === '35030914000180', '');
    test('normaliza documento vazio -> null', imp.normalizarDocumento('   ') === null, '');
    test('identifica CNPJ com 14 dígitos', imp.tipoDocumento('35030914000180') === 'CNPJ', '');
    test('identifica CPF com 11 dígitos', imp.tipoDocumento('05701475654') === 'CPF', '');
    test('documento com tamanho inválido -> null', imp.tipoDocumento('123') === null, '');

    const csvMultilinha = [
      'Nome;CNPJ;Observações',
      '"ALCOA";"00.655.209/0001-93";"linha1',
      'linha2 dentro das aspas"',
      '"OUTRO";"23.637.697/0001-01";"ok"'
    ].join('\n');
    const linhasMulti = imp.parseCsv(csvMultilinha);
    test('parse CSV com campo multilinha entre aspas', linhasMulti.length === 2 && linhasMulti[0]['Observações'].includes('linha2'), JSON.stringify(linhasMulti).slice(0, 120));

    const analiseDup = imp.analisarImportacao([
      { Nome: 'ABADIA INCENDIO', CNPJ: '35.030.914/0001-80', 'Email principal': '' },
      { Nome: 'ABADIA INCENDIO COMPLETO', CNPJ: '35030914000180', 'Email principal': 'a@a.com', Cidade: 'BH', Endereço: 'Rua X', Número: '10' }
    ], []);
    const novosDup = analiseDup.itens.filter((i) => i.acao === 'novo');
    test('duplicado no arquivo mantém o registro mais completo', novosDup.length === 1 && novosDup[0].dados.nome === 'ABADIA INCENDIO COMPLETO' && analiseDup.resumo.duplicados_arquivo === 1, JSON.stringify(analiseDup.resumo));
    test('duplicado descartado é reportado', (analiseDup.itens.filter((i) => i.acao === 'duplicado_arquivo').length === 1), '');

    const analiseErro = imp.analisarImportacao([{ Nome: '', CNPJ: '' }, { Nome: 'SEM DOC', CNPJ: '' }], []);
    test('linha sem nome -> erro', analiseErro.itens.some((i) => i.acao === 'erro' && i.motivo.includes('nome')), '');
    test('linha sem documento -> erro de unicidade', analiseErro.itens.some((i) => i.acao === 'erro' && i.motivo.includes('CPF/CNPJ')), '');

    // --- integração com o arquivo real ---
    const prev = await api('/api/gestor/clientes/importacao/preview', 'POST', gestor, {});
    test('preview da importação retorna mapeamento real do arquivo', prev.status === 200 && prev.data.mapeamento.some((m) => m.coluna === 'Nome' && m.campo === 'cliente.nome'), `${prev.status}`);
    test('preview informa colunas sem campo correspondente', Array.isArray(prev.data.colunas_sem_campo) && prev.data.colunas_sem_campo.includes('Razão Social'), JSON.stringify(prev.data.colunas_sem_campo));
    test('preview lê o arquivo oficial do projeto', prev.status === 200 && prev.data.resumo.total_linhas > 100, JSON.stringify(prev.data.resumo));

    const abadias = prev.data.itens.filter((i) => i.dados && i.dados.documento === '35030914000180');
    test('ABADIA INCENDIO (CNPJ duplicado no arquivo) aparece uma única vez como novo', abadias.filter((i) => i.acao === 'novo').length === 1, JSON.stringify(abadias.map((i) => i.acao)));

    const sesi = prev.data.itens.find((i) => i.dados.documento === '03773834000209');
    test('contato que é CNPJ na planilha não vira responsável', !!sesi && sesi.dados.responsavel_nome === null, JSON.stringify(sesi?.dados?.responsavel_nome));
    const quatroTech = prev.data.itens.find((i) => i.dados.documento === '17983226000152');
    test('nome de contato válido é preservado', !!quatroTech && quatroTech.dados.responsavel_nome === 'Michelly', JSON.stringify(quatroTech?.dados?.responsavel_nome));
    const pmmg39 = prev.data.itens.find((i) => i.dados && i.dados.nome === '39º');
    test('código curto de contato é descartado', !!pmmg39 && pmmg39.dados.responsavel_nome === null, JSON.stringify(pmmg39?.dados?.responsavel_nome));

    const antes = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes.length;
    const conf = await api('/api/gestor/clientes/importacao/confirmar', 'POST', gestor, {});
    test('confirmação importa os clientes novos', conf.status === 200 && conf.data.importados > 100, `${conf.status} ${JSON.stringify(conf.data).slice(0, 150)}`);
    const depois = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes.length;
    test('total de clientes cresce exatamente o número importado', depois - antes === conf.data.importados, `${antes} -> ${depois} vs ${conf.data.importados}`);

    const abadia = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes.find((c) => c.documento === '35030914000180');
    test('cliente importado com documento normalizado existe', !!abadia, '');
    const detalheAbadia = await api(`/api/gestor/clientes/${abadia.id}`, 'GET', gestor);
    test('cliente importado nasce com local e endereço completo', detalheAbadia.status === 200 && detalheAbadia.data.locais.length >= 1 && !!detalheAbadia.data.locais[0].endereco, JSON.stringify(detalheAbadia.data.locais?.[0]).slice(0, 150));

    const conf2 = await api('/api/gestor/clientes/importacao/confirmar', 'POST', gestor, {});
    test('segunda confirmação não duplica nada', conf2.status === 200 && conf2.data.importados === 0 && conf2.data.ja_existentes >= conf.data.importados, JSON.stringify(conf2.data).slice(0, 150));
    const depois2 = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes.length;
    test('quantidade de clientes permanece após re-importação', depois2 === depois, `${depois} vs ${depois2}`);

    const prevTec = await api('/api/gestor/clientes/importacao/preview', 'POST', tecnico, {});
    test('técnico não acessa a importação', prevTec.status === 403, prevTec.status);

    const clienteImp = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes.find((c) => c.total_locais > 0);
    const locaisImp = (await api('/api/gestor/clientes/' + clienteImp.id, 'GET', gestor)).data.locais;
    const novaOsImp = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: clienteImp.id, local_id: locaisImp[0].id,
      servico: 'OS de teste com cliente importado', data_agendada: '2026-12-10', equipe_id: 1
    });
    test('cliente importado é utilizável em OS', novaOsImp.status === 201, `${novaOsImp.status}`);

    const listaCliNav = (await api('/api/gestor/clientes', 'GET', gestor)).data.clientes;
    const cliNav = listaCliNav.find((c) => c.documento === '35030914000180');
    test('lista de clientes traz cidade/UF do primeiro local para navegação', !!cliNav && cliNav.cidade_principal === 'Belo Horizonte' && cliNav.estado_principal === 'MG', JSON.stringify({ c: cliNav?.cidade_principal, e: cliNav?.estado_principal }));
    test('lista de clientes traz nome do responsável do local', !!cliNav && !!cliNav.responsavel_principal && cliNav.responsavel_principal.length > 0, JSON.stringify(cliNav?.responsavel_principal));

    const osTecLista = (await api('/api/tecnico/os', 'GET', tecnico)).data.ordens;
    const osComp = osTecLista.find((o) => o.id === novaOsImp.data.os.id);
    test('técnico vê endereço completo com cidade/UF na lista de OS', !!osComp && (osComp.local_endereco_completo || '').includes('Belo Horizonte/MG'), JSON.stringify(osComp?.local_endereco_completo));

    const detTec = await api(`/api/tecnico/os/${novaOsImp.data.os.id}`, 'GET', tecnico);
    test('detalhe da OS do técnico traz endereço completo', detTec.status === 200 && (detTec.data.os.local_endereco_completo || '').includes('Belo Horizonte/MG'), `${detTec.status} ${JSON.stringify(detTec.data.os?.local_endereco_completo)}`);

    const listaOsGestor = await api('/api/gestor/os', 'GET', gestor);
    const arrOsGestor = listaOsGestor.data.ordens;
    const osCompGestor = arrOsGestor.find((o) => o.id === novaOsImp.data.os.id);
    test('gestor vê endereço completo com cidade/UF nas OS', !!osCompGestor && (osCompGestor.local_endereco_completo || '').includes('Belo Horizonte/MG'), JSON.stringify(osCompGestor?.local_endereco_completo));

    const putResp = await api(`/api/gestor/clientes/${abadia.id}`, 'PUT', gestor, { responsavel_local: 'João da Silva' });
    test('edita responsável do local existente pelo cadastro do cliente', putResp.status === 200, `${putResp.status}`);
    const detResp = await api(`/api/gestor/clientes/${abadia.id}`, 'GET', gestor);
    test('responsável atualizado aparece no primeiro local', detResp.data.locais[0].responsavel_nome === 'João da Silva', JSON.stringify(detResp.data.locais.map((l) => l.responsavel_nome)));

    const clienteNovoSemLocal = await api('/api/gestor/clientes', 'POST', gestor, { nome: 'Cliente sem local para teste' });
    const idNovoSemLocal = clienteNovoSemLocal.data.cliente.id;
    await api(`/api/gestor/clientes/${idNovoSemLocal}`, 'PUT', gestor, { responsavel_local: 'Maria Responsável' });
    const detNovo = await api(`/api/gestor/clientes/${idNovoSemLocal}`, 'GET', gestor);
    test('responsável em cliente sem local cria o local Principal automaticamente', detNovo.data.locais.length === 1 && detNovo.data.locais[0].nome === 'Principal' && detNovo.data.locais[0].responsavel_nome === 'Maria Responsável', JSON.stringify(detNovo.data.locais));
  }

  console.log('Fase 14 - Endereço do cliente como fallback quando a OS não tem local');
  {
    const cFb = await api('/api/gestor/clientes', 'POST', gestor, {
      nome: 'Cliente Fallback Endereco', endereco: 'Rua do Fallback, 456', cidade: 'Belo Horizonte', estado: 'MG'
    });
    test('cria cliente com endereço', cFb.status === 201 && cFb.data.cliente.endereco === 'Rua do Fallback, 456', `${cFb.status} ${JSON.stringify(cFb.data.cliente)}`);
    const osFb = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: cFb.data.cliente.id, servico: 'OS sem local selecionado', data_agendada: '2026-12-15', equipe_id: 1
    });
    test('cria OS sem local (somente cliente)', osFb.status === 201 && osFb.data.os.local_id === null, `${osFb.status} local=${JSON.stringify(osFb.data.os?.local_id)}`);
    const osFbId = osFb.data.os.id;

    const detFb = await api(`/api/tecnico/os/${osFbId}`, 'GET', tecnico);
    test('técnico vê o endereço do cliente no detalhe da OS sem local', detFb.status === 200 && detFb.data.os.local_endereco === 'Rua do Fallback, 456' && detFb.data.os.local_endereco_completo === 'Rua do Fallback, 456', `${detFb.status} ${JSON.stringify({ e: detFb.data.os?.local_endereco, ec: detFb.data.os?.local_endereco_completo })}`);

    const listaFb = await api('/api/tecnico/os', 'GET', tecnico);
    const itemFb = listaFb.data.ordens.find((o) => o.id === osFbId);
    test('endereço do cliente aparece na lista de OS do técnico', !!itemFb && itemFb.local_endereco === 'Rua do Fallback, 456' && (itemFb.local_endereco_completo || '').includes('Rua do Fallback, 456'), JSON.stringify({ e: itemFb?.local_endereco, ec: itemFb?.local_endereco_completo }));

    const agFb = await api('/api/tecnico/agenda?data_inicio=2026-12-15&data_fim=2026-12-15', 'GET', tecnico);
    const agItemFb = agFb.data.agenda.find((i) => i.kind === 'os' && i.id === osFbId);
    test('endereço do cliente aparece na agenda do técnico', !!agItemFb && agItemFb.local_endereco === 'Rua do Fallback, 456' && (agItemFb.local_endereco_completo || '').includes('Rua do Fallback, 456'), JSON.stringify({ e: agItemFb?.local_endereco, ec: agItemFb?.local_endereco_completo }));

    const lFb = await api('/api/gestor/locais', 'POST', gestor, { cliente_id: cFb.data.cliente.id, nome: 'Unidade Fallback', endereco: 'Rua do Local Oficial, 789', cidade: 'Contagem', estado: 'MG' });
    test('cria local oficial para o mesmo cliente', lFb.status === 201 && lFb.data.local.endereco === 'Rua do Local Oficial, 789', `${lFb.status}`);
    const osComLocal = await api('/api/gestor/os', 'POST', gestor, {
      cliente_id: cFb.data.cliente.id, local_id: lFb.data.local.id, servico: 'OS com local selecionado', data_agendada: '2026-12-16', equipe_id: 1
    });
    test('cria OS com local', osComLocal.status === 201 && !!osComLocal.data.os.local_id, `${osComLocal.status}`);
    const detComLocal = await api(`/api/tecnico/os/${osComLocal.data.os.id}`, 'GET', tecnico);
    test('OS com local continua exibindo o endereço do local (não o do cliente)', detComLocal.status === 200 && detComLocal.data.os.local_endereco === 'Rua do Local Oficial, 789' && (detComLocal.data.os.local_endereco_completo || '').includes('Rua do Local Oficial, 789'), `${detComLocal.status} ${JSON.stringify(detComLocal.data.os?.local_endereco)}`);
  }

  server.close();
  require('../server/db').close();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  console.log(`\nResultado: ${passou} passaram, ${falhou} falharam`);
  process.exit(falhou > 0 ? 1 : 0);
})();
