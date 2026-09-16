import { classifyTipo, detectDistrict, detectRealDistrict, extractM2, extractPhones, parsePrice, relativeDate } from './detect';

let failed = 0;

function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got=${g} want=${w}`);
  if (!ok) failed++;
}

// Casos de teléfonos
const phoneCases: Array<[string, string]> = [
  ['#983#983#221', '983983221'],
  ['9/8/3/9/8/3/2/2/1', '983983221'],
  ['+51 983 983 221', '983983221'],
  ['cel 051 983 983 221', '983983221'],
  ['wa.me/51983983221', '983983221'],
  ['VENDO TERRENO 200 M2 - 983 983 221 paucarpata', '983983221'],
  ['Para Mayor informacion 926 927 953', '926927953'],
];
for (const [text, want] of phoneCases) {
  const phones = extractPhones(text);
  check(`phone "${text}"`, phones[0]?.phone ?? '', want);
}

// Caso crucial: el ID de publicación NO debe tomarse como teléfono
check(
  'phone no ID de publicacion',
  extractPhones('Vendo terreno en planicie san Isidro la joya 😎, S/35, Jacobo Hunter, AR, publicación 1824991515172727'),
  []
);
check('phone none en precio', extractPhones('S/ 9,500,000 terreno 200 m2'), []);

// Casos de precios
check('price PEN', parsePrice('S/ 85,000'), { price: '85000', currency: 'PEN' });
check('price USD', parsePrice('US$ 5,000'), { price: '5000', currency: 'USD' });
check('price 0', parsePrice('VENDO TERRENO'), { price: '', currency: '' });
check('price bare', parsePrice('10000 lote'), { price: '10000', currency: '(no indicado)' });
check('price no pequeno', parsePrice('solo 200 m2'), { price: '', currency: '' });

// Casos de m2
check('m2 200', extractM2('VENDO TERRENO 200 M2 URB PAUCARPATA'), '200');
check('m2 nulo', extractM2('TERRENO EN VENTA'), '');
check('m2 metros', extractM2('LOTE 1,500 metros cuadrados'), '1500');

// Casos de distrito priorizado (El caso del usuario!)
const casoUsuario = detectRealDistrict({
  title: 'Vendo terreno en planicie san Isidro la joya 😎',
  marketplaceLocation: 'Jacobo Hunter, AR',
});
check('distrito caso usuario debe ser La Joya (NO Hunter)', casoUsuario.district, 'La Joya');
check('distrito caso usuario fuente debe ser title', casoUsuario.source, 'title');

const casoOcr = detectRealDistrict({
  title: 'Hermoso terreno para inversion',
  ocrText: 'TERRENOS EN VENTA SAN ISIDRO LA JOYA S/. 35,000 450 m2',
  marketplaceLocation: 'Jacobo Hunter, AR',
});
check('distrito caso afiche OCR debe ser La Joya', casoOcr.district, 'La Joya');
check('distrito caso afiche fuente debe ser ocr', casoOcr.source, 'ocr');

const casoContexto = detectRealDistrict({
  title: 'Excelente oportunidad',
  description: 'Se vende lindo lote ubicado en Cayma cerca a la plaza principal',
  marketplaceLocation: 'Cerro Colorado, AR',
});
check('distrito contexto descripcion debe ser Cayma', casoContexto.district, 'Cayma');

const casoFallback = detectRealDistrict({
  title: 'Se vende lote grande',
  description: 'Lote plano con papeles en regla',
  marketplaceLocation: 'Sachaca, AR',
});
check('distrito fallback location debe ser Sachaca', casoFallback.district, 'Sachaca');

check('distrito paucarpata', detectDistrict('Arequipa, Paucarpata - VENDO TERRENO'), 'Paucarpata');
check('distrito la joya', detectDistrict('lote en la joya 200m2'), 'La Joya');
check('distrito vacio', detectDistrict('sin referencia'), '');

// Casos de tipo
check('tipo terreno', classifyTipo('VENDO TERRENO EN YURA'), 'terreno');
check('tipo lote', classifyTipo('VENDO LOTE DE 250 M2'), 'lote');
check('tipo agricola', classifyTipo('TERRENO AGRICOLA EN VENTA CAMANA'), 'agricola');
check('tipo departamento', classifyTipo('DEPARTAMENTO EN ALQUILER'), 'departamento');
check('tipo duplex', classifyTipo('DUPLEX CERCA DEL CENTRO'), 'duplex');
check('tipo otro', classifyTipo('VENTA DE AUTO'), 'otro');

check('relativeDate', relativeDate('Hace 3 horas - Paucarpata, Arequipa'), 'Hace 3 horas');
check('relativeDate none', relativeDate('VENDO TERRENO'), '');

console.log(failed ? `\n${failed} fallos` : '\nTodos los detectores OK');
process.exit(failed ? 1 : 0);