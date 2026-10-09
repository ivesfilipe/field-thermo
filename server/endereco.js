function sqlEnderecoCompleto(alias = 'l', nomeCampo = 'local_endereco_completo', aliasCliente = null) {
  const expressaoLocal = `
    CASE WHEN COALESCE(${alias}.endereco,'') = '' THEN NULL
    ELSE RTRIM(RTRIM(COALESCE(${alias}.endereco,''), ', ')
      || CASE WHEN COALESCE(${alias}.cidade,'') != '' THEN ', ' || ${alias}.cidade ELSE '' END
      || CASE WHEN COALESCE(${alias}.estado,'') != '' THEN '/' || ${alias}.estado ELSE '' END)
    END`;
  if (!aliasCliente) {
    return `${expressaoLocal} AS ${nomeCampo}`;
  }
  return `COALESCE(${expressaoLocal}, NULLIF(COALESCE(${aliasCliente}.endereco,''), '')) AS ${nomeCampo}`;
}

function sqlEnderecoLocalOuCliente(alias = 'l', aliasCliente = 'c', nomeCampo = 'local_endereco') {
  return `COALESCE(NULLIF(COALESCE(${alias}.endereco,''), ''), NULLIF(COALESCE(${aliasCliente}.endereco,''), '')) AS ${nomeCampo}`;
}

module.exports = { sqlEnderecoCompleto, sqlEnderecoLocalOuCliente };
