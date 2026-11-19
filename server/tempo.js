// Fuso horário padrão do sistema: Horário Oficial de Brasília (UTC-3)
process.env.TZ = 'America/Sao_Paulo';

const TZ_BRASILIA = 'America/Sao_Paulo';

function agoraBrasilia(data = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BRASILIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(data);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  const hora = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hora}:${get('minute')}:${get('second')}`;
}

function hojeBrasilia(data = new Date()) {
  return agoraBrasilia(data).slice(0, 10);
}

module.exports = {
  TZ_BRASILIA,
  agoraBrasilia,
  hojeBrasilia
};
